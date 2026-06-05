#!/usr/bin/env bash
# =============================================================================
#  VPS free-internet setup for Iran  (Shadowsocks via sing-box)
#  Run as root on the VPS:  bash setup-proxy.sh
#
#  What it does (SAFE - cannot lock you out of SSH):
#    1. Sets anti-sanction DNS (Shecan) so the box can reach GitHub/Docker/etc.
#    2. Installs sing-box (single static binary).
#    3. Configures your Shadowsocks server as the outbound exit.
#    4. Runs a local proxy:  SOCKS5 127.0.0.1:1080  +  HTTP 127.0.0.1:1081
#    5. Points apt, docker, git and shell env at that proxy.
#
#  Full transparent routing (ALL traffic) is a SEPARATE, optional step:
#  see enable-tunnel.sh  (it has a 10-minute auto-revert killswitch).
# =============================================================================
set -euo pipefail

# ---- Your Shadowsocks config (decoded from your ss:// link) -----------------
SS_SERVER="srv6.blueshadow.top"
SS_PORT="19921"
SS_METHOD="aes-256-gcm"
SS_PASSWORD="sx1OEaPZSsA"

# ---- Local proxy ports ------------------------------------------------------
SOCKS_PORT="1080"
HTTP_PORT="1081"

# ---- sing-box version (pinned so the config schema always matches) ----------
SB_VER="1.9.7"

# ---- Anti-sanction DNS (Shecan + 403.online) --------------------------------
DNS1="178.22.122.100"   # Shecan
DNS2="10.202.10.202"    # 403.online

log(){ printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warn(){ printf '\n\033[1;33m[!]\033[0m %s\n' "$*"; }
die(){ printf '\n\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "Run as root (use: sudo bash setup-proxy.sh)"

# -----------------------------------------------------------------------------
log "Step 1/6  Setting anti-sanction DNS (Shecan)"
# -----------------------------------------------------------------------------
if [ ! -f /etc/resolv.conf.orig ]; then
  cp -a /etc/resolv.conf /etc/resolv.conf.orig 2>/dev/null || true
fi
# If systemd-resolved manages it, stop it overriding us.
if [ -L /etc/resolv.conf ]; then rm -f /etc/resolv.conf; fi
cat > /etc/resolv.conf <<EOF
nameserver $DNS1
nameserver $DNS2
nameserver 1.1.1.1
EOF
log "DNS set to Shecan ($DNS1) + 403.online ($DNS2). Backup: /etc/resolv.conf.orig"

# -----------------------------------------------------------------------------
log "Step 2/6  Detecting architecture & downloading sing-box v$SB_VER"
# -----------------------------------------------------------------------------
case "$(uname -m)" in
  x86_64|amd64) ARCH="amd64" ;;
  aarch64|arm64) ARCH="arm64" ;;
  armv7l) ARCH="armv7" ;;
  *) die "Unsupported arch: $(uname -m)" ;;
esac

PKG="sing-box-${SB_VER}-linux-${ARCH}.tar.gz"
BASE="https://github.com/SagerNet/sing-box/releases/download/v${SB_VER}/${PKG}"
# Mirrors that usually work from inside Iran (tried in order):
URLS=(
  "$BASE"
  "https://gh-proxy.com/${BASE}"
  "https://ghproxy.net/${BASE}"
  "https://mirror.ghproxy.com/${BASE}"
  "https://sourceforge.net/projects/sing-box.mirror/files/v${SB_VER}/${PKG}/download"
)

cd /tmp
rm -f "$PKG"
ok=0
for u in "${URLS[@]}"; do
  log "trying: $u"
  if curl -fL --connect-timeout 15 --retry 2 -o "$PKG" "$u"; then ok=1; break; fi
done
[ "$ok" = "1" ] || die "Could not download sing-box. Check internet/DNS, or download $PKG manually and place it in /tmp, then re-run."

tar -xzf "$PKG"
install -m 0755 "sing-box-${SB_VER}-linux-${ARCH}/sing-box" /usr/local/bin/sing-box
log "Installed: $(/usr/local/bin/sing-box version | head -1)"

# -----------------------------------------------------------------------------
log "Step 3/6  Writing sing-box configs"
# -----------------------------------------------------------------------------
mkdir -p /etc/sing-box

# ---- base config: SOCKS + HTTP local proxy only (no system-wide routing) ----
cat > /etc/sing-box/config-base.json <<EOF
{
  "log": { "level": "warn", "timestamp": true },
  "dns": {
    "servers": [
      { "tag": "remote", "address": "https://1.1.1.1/dns-query", "detour": "ss-out" },
      { "tag": "local",  "address": "$DNS1", "detour": "direct" }
    ],
    "rules": [
      { "domain_suffix": ["blueshadow.top"], "server": "local" }
    ],
    "final": "remote",
    "strategy": "prefer_ipv4"
  },
  "inbounds": [
    { "type": "socks", "tag": "socks-in", "listen": "127.0.0.1", "listen_port": $SOCKS_PORT, "sniff": true },
    { "type": "http",  "tag": "http-in",  "listen": "127.0.0.1", "listen_port": $HTTP_PORT,  "sniff": true }
  ],
  "outbounds": [
    { "type": "shadowsocks", "tag": "ss-out", "server": "$SS_SERVER", "server_port": $SS_PORT, "method": "$SS_METHOD", "password": "$SS_PASSWORD" },
    { "type": "direct", "tag": "direct" },
    { "type": "dns", "tag": "dns-out" }
  ],
  "route": {
    "rules": [
      { "protocol": "dns", "outbound": "dns-out" },
      { "ip_is_private": true, "outbound": "direct" }
    ],
    "final": "ss-out",
    "auto_detect_interface": true
  }
}
EOF

# ---- tunnel config: everything above PLUS a TUN device for full routing -----
cat > /etc/sing-box/config-tun.json <<EOF
{
  "log": { "level": "warn", "timestamp": true },
  "dns": {
    "servers": [
      { "tag": "remote", "address": "https://1.1.1.1/dns-query", "detour": "ss-out" },
      { "tag": "local",  "address": "$DNS1", "detour": "direct" }
    ],
    "rules": [
      { "domain_suffix": ["blueshadow.top"], "server": "local" }
    ],
    "final": "remote",
    "strategy": "prefer_ipv4"
  },
  "inbounds": [
    { "type": "socks", "tag": "socks-in", "listen": "127.0.0.1", "listen_port": $SOCKS_PORT, "sniff": true },
    { "type": "http",  "tag": "http-in",  "listen": "127.0.0.1", "listen_port": $HTTP_PORT,  "sniff": true },
    {
      "type": "tun",
      "tag": "tun-in",
      "interface_name": "singbox0",
      "inet4_address": "172.19.0.1/30",
      "auto_route": true,
      "strict_route": false,
      "stack": "system",
      "sniff": true
    }
  ],
  "outbounds": [
    { "type": "shadowsocks", "tag": "ss-out", "server": "$SS_SERVER", "server_port": $SS_PORT, "method": "$SS_METHOD", "password": "$SS_PASSWORD" },
    { "type": "direct", "tag": "direct" },
    { "type": "dns", "tag": "dns-out" }
  ],
  "route": {
    "rules": [
      { "protocol": "dns", "outbound": "dns-out" },
      { "ip_is_private": true, "outbound": "direct" }
    ],
    "final": "ss-out",
    "auto_detect_interface": true
  }
}
EOF

# The active config starts as the SAFE base config.
cp -f /etc/sing-box/config-base.json /etc/sing-box/config.json
/usr/local/bin/sing-box check -c /etc/sing-box/config.json || die "sing-box config check failed"

# -----------------------------------------------------------------------------
log "Step 4/6  Installing systemd service"
# -----------------------------------------------------------------------------
cat > /etc/systemd/system/sing-box.service <<'EOF'
[Unit]
Description=sing-box proxy
After=network-online.target
Wants=network-online.target

[Service]
ExecStart=/usr/local/bin/sing-box run -c /etc/sing-box/config.json
Restart=on-failure
RestartSec=3
LimitNOFILE=1048576
AmbientCapabilities=CAP_NET_ADMIN CAP_NET_RAW

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now sing-box
sleep 2
systemctl is-active --quiet sing-box || { journalctl -u sing-box -n 30 --no-pager; die "sing-box failed to start"; }
log "sing-box is running. SOCKS5=127.0.0.1:$SOCKS_PORT  HTTP=127.0.0.1:$HTTP_PORT"

# -----------------------------------------------------------------------------
log "Step 5/6  Pointing apt / git / docker / shell at the proxy"
# -----------------------------------------------------------------------------
# apt
cat > /etc/apt/apt.conf.d/95proxies <<EOF
Acquire::http::Proxy  "http://127.0.0.1:$HTTP_PORT";
Acquire::https::Proxy "http://127.0.0.1:$HTTP_PORT";
EOF

# git (global)
git config --global http.proxy  "http://127.0.0.1:$HTTP_PORT" 2>/dev/null || true
git config --global https.proxy "http://127.0.0.1:$HTTP_PORT" 2>/dev/null || true

# docker daemon (image pulls)
if command -v docker >/dev/null 2>&1 || [ -d /etc/systemd/system ]; then
  mkdir -p /etc/systemd/system/docker.service.d
  cat > /etc/systemd/system/docker.service.d/http-proxy.conf <<EOF
[Service]
Environment="HTTP_PROXY=http://127.0.0.1:$HTTP_PORT"
Environment="HTTPS_PROXY=http://127.0.0.1:$HTTP_PORT"
Environment="NO_PROXY=localhost,127.0.0.1,::1,$SS_SERVER"
EOF
  systemctl daemon-reload 2>/dev/null || true
  systemctl restart docker 2>/dev/null && log "Docker daemon now uses the proxy for pulls" || warn "Docker not installed/running - skipped (config saved for when it is)"
fi

# shell environment for interactive sessions
cat > /etc/profile.d/proxy.sh <<EOF
export http_proxy="http://127.0.0.1:$HTTP_PORT"
export https_proxy="http://127.0.0.1:$HTTP_PORT"
export HTTP_PROXY="http://127.0.0.1:$HTTP_PORT"
export HTTPS_PROXY="http://127.0.0.1:$HTTP_PORT"
export all_proxy="socks5://127.0.0.1:$SOCKS_PORT"
export NO_PROXY="localhost,127.0.0.1,::1,$SS_SERVER,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,.local"
export no_proxy="\$NO_PROXY"
EOF
log "Shell proxy env written to /etc/profile.d/proxy.sh (active on next login / 'source' it now)"

# -----------------------------------------------------------------------------
log "Step 6/6  Verifying the exit IP through the proxy"
# -----------------------------------------------------------------------------
DIRECT_IP=$(curl -s --max-time 10 https://api.ipify.org || echo "?")
PROXY_IP=$(curl -s --max-time 15 -x "http://127.0.0.1:$HTTP_PORT" https://api.ipify.org || echo "?")
echo
echo "  Server's real IP (direct) : $DIRECT_IP"
echo "  IP through the proxy      : $PROXY_IP"
echo
if [ "$PROXY_IP" != "?" ] && [ "$PROXY_IP" != "$DIRECT_IP" ]; then
  log "SUCCESS - proxy traffic exits via $PROXY_IP (your Shadowsocks server)."
else
  warn "Proxy IP not confirmed. Check: journalctl -u sing-box -n 50 --no-pager"
fi

cat <<EOF

------------------------------------------------------------------
DONE (safe mode). Use it like this:

  curl -x http://127.0.0.1:$HTTP_PORT https://google.com     # one-off
  source /etc/profile.d/proxy.sh                             # this shell
  apt update                                                 # already proxied
  docker pull hello-world                                    # already proxied

To route ABSOLUTELY ALL traffic through the tunnel, run:
  bash enable-tunnel.sh        (auto-reverts in 10 min if SSH breaks)
------------------------------------------------------------------
EOF
