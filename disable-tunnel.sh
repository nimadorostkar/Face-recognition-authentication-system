#!/usr/bin/env bash
# Turn OFF full tunnel, go back to safe SOCKS/HTTP-only mode, cancel killswitch.
# Run as root:  bash disable-tunnel.sh
set -uo pipefail
[ "$(id -u)" = "0" ] || { echo "Run as root."; exit 1; }

if [ -x /usr/local/bin/sb-disable-tunnel ]; then
  /usr/local/bin/sb-disable-tunnel
else
  SSH_PORT="3031"
  [ -f /etc/sing-box/config-base.json ] && cp -f /etc/sing-box/config-base.json /etc/sing-box/config.json
  ip rule del fwmark 0x6 lookup main priority 100 2>/dev/null || true
  iptables -t mangle -D OUTPUT -p tcp --sport "$SSH_PORT" -j MARK --set-mark 0x6 2>/dev/null || true
  systemctl restart sing-box 2>/dev/null || true
  systemctl stop singbox-killswitch.timer 2>/dev/null || true
  systemctl reset-failed singbox-killswitch.timer singbox-killswitch.service 2>/dev/null || true
fi
echo "==> Reverted to safe mode. Local proxy still up: SOCKS5 127.0.0.1:1080 / HTTP 127.0.0.1:1081"
