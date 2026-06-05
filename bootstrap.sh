#!/usr/bin/env bash
# =============================================================================
#  ALL-IN-ONE for the Face-recognition-authentication-system project.
#  On the VPS (as root):
#       bash bootstrap.sh
#  (optionally pass a different git URL as $1)
#
#  Does, unattended and SSH-safe (no full tunnel):
#    1. Installs the Shadowsocks proxy (setup-proxy.sh) if not present.
#    2. Exposes the proxy to the Docker bridge (firewalled to localhost+docker).
#    3. Installs Docker + Compose (through the proxy).
#    4. Wires Docker daemon + build/run to use the proxy (works from Iran).
#    5. Clones the repo and runs `docker compose up --build -d`.
# =============================================================================
set -euo pipefail

REPO_URL="${1:-https://github.com/nimadorostkar/Face-recognition-authentication-system.git}"
APP_DIR="/opt/face-auth"
HTTP_PORT="1081"
SOCKS_PORT="1080"
DOCKER_GW="172.17.0.1"     # default docker0 bridge gateway (host, seen from containers)

log(){ printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warn(){ printf '\n\033[1;33m[!]\033[0m %s\n' "$*"; }
die(){ printf '\n\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" = "0" ] || die "Run as root."
HERE="$(cd "$(dirname "$0")" && pwd)"

# -----------------------------------------------------------------------------
log "1/6  Ensuring Shadowsocks proxy is installed"
# -----------------------------------------------------------------------------
if ! command -v sing-box >/dev/null 2>&1 || [ ! -f /etc/sing-box/config.json ]; then
  [ -f "$HERE/setup-proxy.sh" ] || die "setup-proxy.sh must sit next to bootstrap.sh."
  bash "$HERE/setup-proxy.sh"
fi

# -----------------------------------------------------------------------------
log "2/6  Exposing proxy to the Docker bridge (firewalled)"
# -----------------------------------------------------------------------------
# Containers can't reach the host's 127.0.0.1, so make sing-box listen on all
# interfaces, then firewall ports so ONLY localhost + docker subnets can use it.
for f in /etc/sing-box/config-base.json /etc/sing-box/config-tun.json; do
  [ -f "$f" ] && sed -i 's/"listen": "127\.0\.0\.1"/"listen": "0.0.0.0"/g' "$f"
done
cp -f /etc/sing-box/config-base.json /etc/sing-box/config.json
/usr/local/bin/sing-box check -c /etc/sing-box/config.json || die "sing-box config check failed"
systemctl restart sing-box; sleep 2

# Firewall: allow localhost + docker (172.16/12), drop everyone else on these ports.
for p in "$SOCKS_PORT" "$HTTP_PORT"; do
  iptables -C INPUT -p tcp --dport "$p" -s 127.0.0.1 -j ACCEPT 2>/dev/null || iptables -A INPUT -p tcp --dport "$p" -s 127.0.0.1 -j ACCEPT
  iptables -C INPUT -p tcp --dport "$p" -s 172.16.0.0/12 -j ACCEPT 2>/dev/null || iptables -A INPUT -p tcp --dport "$p" -s 172.16.0.0/12 -j ACCEPT
  iptables -C INPUT -p tcp --dport "$p" -j DROP 2>/dev/null || iptables -A INPUT -p tcp --dport "$p" -j DROP
done
log "Proxy now reachable by containers at http://$DOCKER_GW:$HTTP_PORT (blocked from the public internet)."

# Make the host shell use the proxy for the rest of this script.
export http_proxy="http://127.0.0.1:$HTTP_PORT" https_proxy="http://127.0.0.1:$HTTP_PORT"
export HTTP_PROXY="$http_proxy" HTTPS_PROXY="$https_proxy"
export NO_PROXY="localhost,127.0.0.1,::1,srv6.blueshadow.top,$DOCKER_GW,db,api,frontend"
log "Exit IP through proxy: $(curl -s --max-time 15 https://api.ipify.org || echo '?')"

# -----------------------------------------------------------------------------
log "3/6  Installing git + Docker (through the proxy)"
# -----------------------------------------------------------------------------
export DEBIAN_FRONTEND=noninteractive
apt-get update -y || warn "apt update issues - continuing"
apt-get install -y git curl ca-certificates || warn "apt install issues - continuing"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
  sh /tmp/get-docker.sh
fi
docker compose version >/dev/null 2>&1 || apt-get install -y docker-compose-plugin || true

# -----------------------------------------------------------------------------
log "4/6  Wiring Docker to the proxy (registry pulls + build + runtime)"
# -----------------------------------------------------------------------------
# (a) Daemon proxy = host loopback (dockerd runs on the host) -> for image pulls
mkdir -p /etc/systemd/system/docker.service.d
cat > /etc/systemd/system/docker.service.d/http-proxy.conf <<EOF
[Service]
Environment="HTTP_PROXY=http://127.0.0.1:$HTTP_PORT"
Environment="HTTPS_PROXY=http://127.0.0.1:$HTTP_PORT"
Environment="NO_PROXY=localhost,127.0.0.1,::1,srv6.blueshadow.top"
EOF
# (b) CLI proxy = docker bridge gateway (reachable from build/run containers)
mkdir -p /root/.docker
cat > /root/.docker/config.json <<EOF
{
  "proxies": {
    "default": {
      "httpProxy":  "http://$DOCKER_GW:$HTTP_PORT",
      "httpsProxy": "http://$DOCKER_GW:$HTTP_PORT",
      "noProxy":    "localhost,127.0.0.1,db,api,frontend,$DOCKER_GW,srv6.blueshadow.top"
    }
  }
}
EOF
systemctl daemon-reload
systemctl restart docker; sleep 3
log "Docker proxy configured. Daemon: 127.0.0.1  |  builds/containers: $DOCKER_GW"

# -----------------------------------------------------------------------------
log "5/6  Cloning $REPO_URL"
# -----------------------------------------------------------------------------
git config --global http.proxy  "http://127.0.0.1:$HTTP_PORT"
git config --global https.proxy "http://127.0.0.1:$HTTP_PORT"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull --ff-only || warn "pull failed - using existing checkout"
else
  rm -rf "$APP_DIR"; git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"

# -----------------------------------------------------------------------------
log "6/6  Building & starting the stack (this can take a while - dlib build)"
# -----------------------------------------------------------------------------
docker compose up --build -d 2>/dev/null || docker-compose up --build -d
sleep 8
docker compose ps 2>/dev/null || docker ps

echo
log "Waiting for the API health endpoint..."
for i in $(seq 1 60); do
  if curl -s --max-time 5 http://127.0.0.1:8000/health >/dev/null 2>&1; then
    log "API is healthy."; break
  fi; sleep 3
done

VPS_IP="$(curl -s --max-time 10 https://api.ipify.org || echo '<vps-ip>')"
cat <<EOF

------------------------------------------------------------------
DONE. Stack is up in $APP_DIR

  Frontend (open in your browser): http://$VPS_IP:3000
  API (local to the VPS):          http://127.0.0.1:8000  (docs at /docs)
  Postgres:                        127.0.0.1:5432

  Manage it:   cd $APP_DIR && ./start.sh status | logs | stop | restart
  Logs:        docker compose -f $APP_DIR/docker-compose.yml logs -f

  NOTE: port 3000 must be open in your VPS firewall to reach the UI.
        e.g.  ufw allow 3000/tcp   (or your provider's panel)
------------------------------------------------------------------
EOF
