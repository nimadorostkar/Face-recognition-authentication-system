#!/usr/bin/env bash
# Run this ONLY after you have verified (in a second SSH session) that both
# SSH and internet work with the tunnel on. It cancels the auto-revert so the
# full tunnel stays on permanently (and survives reboots).
# Run as root:  bash confirm-tunnel.sh
set -uo pipefail
[ "$(id -u)" = "0" ] || { echo "Run as root."; exit 1; }

# Make the tunnel config the one used at boot.
cp -f /etc/sing-box/config-tun.json /etc/sing-box/config.json

# Cancel the killswitch.
systemctl stop singbox-killswitch.timer 2>/dev/null || true
systemctl reset-failed singbox-killswitch.timer singbox-killswitch.service 2>/dev/null || true

# Persist the SSH-protection rule across reboots via a tiny boot service.
cat > /etc/systemd/system/sb-ssh-guard.service <<'EOF'
[Unit]
Description=Keep SSH off the sing-box tunnel
After=network.target
[Service]
Type=oneshot
ExecStart=/sbin/iptables -t mangle -A OUTPUT -p tcp --sport 3031 -j MARK --set-mark 0x6
ExecStart=/sbin/ip rule add fwmark 0x6 lookup main priority 100
RemainAfterExit=yes
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload 2>/dev/null || true
systemctl enable sb-ssh-guard.service 2>/dev/null || true

systemctl enable sing-box 2>/dev/null || true
echo "==> Tunnel locked in. Killswitch cancelled. It will persist across reboots."
echo "    To undo later:  bash disable-tunnel.sh"
