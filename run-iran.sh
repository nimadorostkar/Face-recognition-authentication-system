#!/usr/bin/env bash
# =============================================================================
#  Build & run the Face-recognition-authentication-system on a VPS in Iran,
#  routing all build-time downloads (pip + apt) through the local Shadowsocks
#  proxy via HOST networking (so the build can reach 127.0.0.1:1081).
#
#  Prereq: setup-proxy.sh already ran (sing-box listening on 127.0.0.1:1081).
#  Run from the project root:   bash run-iran.sh
# =============================================================================
set -euo pipefail

PROXY="http://127.0.0.1:1081"
log(){ printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
die(){ printf '\n\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

[ "$(id -u)" = "0" ] || die "Run as root."
[ -f docker-compose.yml ] || die "Run this from the project root (where docker-compose.yml is)."
command -v sing-box >/dev/null 2>&1 || die "sing-box not found - run setup-proxy.sh first."

# 1. Make sure the proxy is up and actually reaching the internet ---------------
systemctl is-active --quiet sing-box || systemctl start sing-box
sleep 1
TESTIP="$(curl -s --max-time 15 -x "$PROXY" https://api.ipify.org || echo '')"
[ -n "$TESTIP" ] || die "Proxy not reaching the internet. Check: journalctl -u sing-box -n 30 --no-pager"
log "Proxy works. Exit IP: $TESTIP"

# 2. Image names exactly as docker compose expects -----------------------------
PROJECT="$(basename "$PWD" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9_-]//g')"
log "Compose project: $PROJECT"

# 3. Build with HOST networking + proxy build-args (classic builder = reliable) -
BUILD_ARGS=(
  --network=host
  --build-arg HTTP_PROXY="$PROXY"  --build-arg HTTPS_PROXY="$PROXY"
  --build-arg http_proxy="$PROXY"  --build-arg https_proxy="$PROXY"
  --build-arg NO_PROXY="localhost,127.0.0.1"
)

log "Building API image (slow dlib/numpy build - be patient, several minutes)..."
DOCKER_BUILDKIT=0 docker build "${BUILD_ARGS[@]}" -t "${PROJECT}-api" ./api

log "Building frontend image..."
DOCKER_BUILDKIT=0 docker build "${BUILD_ARGS[@]}" -t "${PROJECT}-frontend" ./frontend

# Tag both naming styles so any docker-compose version reuses these images
docker tag "${PROJECT}-api"      "${PROJECT}_api"      2>/dev/null || true
docker tag "${PROJECT}-frontend" "${PROJECT}_frontend" 2>/dev/null || true

# 4. Start the stack (DB image pulled via the docker daemon proxy) -------------
log "Starting the stack..."
docker compose up -d
sleep 6
docker compose ps

# 5. Wait for API health -------------------------------------------------------
log "Waiting for the API to come up..."
for i in $(seq 1 40); do
  if curl -s --max-time 5 http://127.0.0.1:8000/health >/dev/null 2>&1; then log "API healthy."; break; fi
  sleep 3
done

cat <<EOF

------------------------------------------------------------------
DONE.
  Frontend UI : http://<your-vps-ip>:3000   (open port 3000 in firewall)
  API / docs  : http://127.0.0.1:8000/docs  (VPS-local)
  Manage      : docker compose ps | logs -f | restart | down
------------------------------------------------------------------
EOF
