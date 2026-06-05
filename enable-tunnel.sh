#!/usr/bin/env bash
# =============================================================================
#  Turn ON full transparent routing (ALL of the VPS traffic -> Shadowsocks).
#  SAFETY: arms a 10-minute auto-revert. If SSH freezes, DO NOTHING - wait
#  10 minutes, the box reverts itself, then reconnect. Nothing is permanent
#  until you run  confirm-tunnel.sh.
#
#  Run as root:  bash enable-tunnel.sh
# =============================================================================
set -euo pipefail

SSH_PORT="3031"                 # your SSH port - kept OFF the tunnel
REVERT_SECONDS="600"            # auto-revert after 10 minutes

log(){ printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warn(){ printf '\n\033[1;33m[!]\033[0m %s\n' "$*"; }
die(){ printf '\n\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }
[ "$(id -u)" = "0" ] || die "Run as root."
[ -f /etc/sing-box/config-tun.json ] || die "Run setup-proxy.sh first."

# --- Install the revert helper that the killswitch (and you) will call -------
cat > /usr/local/bin/sb-disable-tunnel <<'REVERT'
#!/usr/bin/env bash
# Revert to safe SOCKS/HTTP-only mode and clean up tunnel routing.
set -uo pipefail
SSH_PORT="3031"
[ -f /etc/sing-box/config-base.json ] && cp -f /etc/sing-box/config-base.json /etc/sing-box/config.json
ip rule del fwmark 0x6 lookup main priority 100 2>/dev/null || true
iptables -t mangle -D OUTPUT -p tcp --sport "$SSH_PORT" -j MARK --set-mark 0x6 2>/dev/null || true
systemctl restart sing-box 2>/dev/null || true
systemctl stop singbox-killswitch.timer 2>/dev/null || true
systemctl reset-failed singbox-killswitch.timer singbox-killswitch.service 2>/dev/null || true
logger -t sb-tunnel "tunnel reverted to safe SOCKS/HTTP mode" 2>/dev/null || true
REVERT
chmod 0755 /usr/local/bin/sb-disable-tunnel

# --- Best-effort: keep the CURRENT SSH session alive while tunnel is up ------
# Mark packets that sshd sends back to you (source port = SSH_PORT) and force
# them onto the normal routing table instead of the tunnel.
iptables -t mangle -C OUTPUT -p tcp --sport "$SSH_PORT" -j MARK --set-mark 0x6 2>/dev/null \
  || iptables -t mangle -A OUTPUT -p tcp --sport "$SSH_PORT" -j MARK --set-mark 0x6
ip rule del fwmark 0x6 lookup main priority 100 2>/dev/null || true
ip rule add fwmark 0x6 lookup main priority 100

# --- Arm the auto-revert killswitch FIRST (so it fires even if we lose SSH) --
systemctl stop singbox-killswitch.timer 2>/dev/null || true
systemd-run --on-active="$REVERT_SECONDS" --unit=singbox-killswitch \
  /usr/local/bin/sb-disable-tunnel >/dev/null
log "Killswitch armed: auto-revert in $((REVERT_SECONDS/60)) minutes."

# --- Switch to the tunnel config & restart -----------------------------------
cp -f /etc/sing-box/config.json /etc/sing-box/config.prev.json 2>/dev/null || true
cp -f /etc/sing-box/config-tun.json /etc/sing-box/config.json
/usr/local/bin/sing-box check -c /etc/sing-box/config.json || die "tun config check failed"
systemctl restart sing-box
sleep 3
systemctl is-active --quiet sing-box || { journalctl -u sing-box -n 30 --no-pager; die "sing-box failed with tun config"; }

# --- Report ------------------------------------------------------------------
PROXY_IP=$(curl -s --max-time 15 https://api.ipify.org || echo "?")
cat <<EOF

------------------------------------------------------------------
FULL TUNNEL IS ON.  Your default exit IP is now: $PROXY_IP

  >> TEST NOW (new terminal recommended):
       - Open a SECOND SSH session: ssh root@<ip> -p $SSH_PORT
       - Run:  curl https://api.ipify.org   (should show the proxy IP)

  >> If everything works, LOCK IT IN:
       bash confirm-tunnel.sh

  >> If SSH froze or internet is broken: do nothing.
     The box auto-reverts in $((REVERT_SECONDS/60)) minutes - then reconnect.
     Or, if you still have a shell:  bash disable-tunnel.sh
------------------------------------------------------------------
EOF
