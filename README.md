# VPS Free-Internet Setup (Iran) — Runbook

Routes your VPS at `45.159.113.73` out through your Shadowsocks server so it can
reach Docker Hub, Google, GitHub, npm, and other sanctioned/blocked services.

> **Why I couldn't do this for you remotely:** my environment only allows
> outbound connections to an allowlisted set of hosts, so I can't SSH into your
> box. These scripts do everything in one paste — you just run them on the VPS.

## What your link actually is
Your `ss://…` link decodes to a **Shadowsocks** server (not vmess/vless v2ray):

| field | value |
|-------|-------|
| server | `srv6.blueshadow.top` |
| port | `19921` |
| method | `aes-256-gcm` |
| password | `sx1OEaPZSsA` |

That's fine — sing-box routes through it the same way.

---

## Step 1 — Copy the files to the VPS

From your own computer:

```bash
scp -P 3031 setup-proxy.sh enable-tunnel.sh disable-tunnel.sh confirm-tunnel.sh root@45.159.113.73:/root/
```

(If `scp` is blocked, just open each file, copy the contents, and paste into a
new file on the server with `nano setup-proxy.sh`.)

---

## Step 2 — Run the safe installer

SSH in and run:

```bash
ssh root@45.159.113.73 -p 3031
bash setup-proxy.sh
```

This **cannot lock you out**. It:

1. Sets anti-sanction **DNS (Shecan)** — alone this often fixes Docker/Google/GitHub.
2. Installs **sing-box** (pinned v1.9.7, with mirrors for when GitHub is blocked).
3. Configures your **Shadowsocks** server as the exit.
4. Starts a local proxy: **SOCKS5 `127.0.0.1:1080`** and **HTTP `127.0.0.1:1081`**.
5. Points **apt, git, docker, and the shell** at that proxy.

At the end it prints your real IP vs. the proxy IP — they should differ.

### Using it (safe mode)
```bash
curl -x http://127.0.0.1:1081 https://api.ipify.org   # one-off through proxy
source /etc/profile.d/proxy.sh                         # proxy this shell
apt update                                             # already proxied
docker pull hello-world                                # already proxied
git clone https://github.com/...                       # already proxied
```

For most "my Iranian VPS can't pull Docker images / reach Google" problems,
**Step 2 is all you need.**

---

## Step 3 — (Optional) Route ABSOLUTELY ALL traffic

Only if you want every program on the box tunneled automatically, with no
per-app config. This carries a small risk of freezing SSH, so it has a built-in
**10-minute auto-revert**.

```bash
bash enable-tunnel.sh
```

Then **verify in a SECOND SSH session** (keep the first one open):

```bash
ssh root@45.159.113.73 -p 3031
curl https://api.ipify.org        # should show your proxy IP
```

- **Works?** Lock it in (cancels the auto-revert, persists across reboots):
  ```bash
  bash confirm-tunnel.sh
  ```
- **SSH froze / internet broke?** Do nothing — the box reverts itself in 10
  minutes, then reconnect. Or if you still have a shell:
  ```bash
  bash disable-tunnel.sh
  ```

### Safety design
- Your SSH port **3031** and the Shadowsocks server's IP are kept **off** the
  tunnel, so the control path stays alive.
- `enable-tunnel.sh` arms a systemd auto-revert **before** changing routing, so
  even a total loss of SSH self-heals in 10 minutes.
- Nothing becomes permanent until you run `confirm-tunnel.sh`.

---

## DNS-only option (no proxy at all)
If you ever just want the anti-sanction DNS without routing traffic, the
installer already set it. To do it manually:
```bash
printf 'nameserver 178.22.122.100\nnameserver 10.202.10.202\n' > /etc/resolv.conf
```
- Shecan: `178.22.122.100`, `185.51.200.2`
- 403.online: `10.202.10.202`, `10.202.10.102`
- Electro: `78.157.42.100`, `78.157.42.101`

This unblocks **sanctioned** services (Docker, Google, etc.). It does **not**
bypass censorship of blocked sites — for that you need the proxy (Steps 2–3).

---

## Step 4 — Clone & run the Face-recognition project (one command)

The repo is a Docker stack: **FastAPI API** (`:8000`), **Next.js frontend**
(`:3000`), **Postgres/pgvector** (`:5432`), started with
`docker compose up --build -d`. The catch in Iran: Docker's *image pulls* and the
*in-build pip/apt* steps also need the proxy, and containers can't reach the
host's `127.0.0.1`. `bootstrap.sh` handles all of that and runs the stack:

```bash
# copy bootstrap.sh too, then on the VPS:
bash bootstrap.sh
```

It will: install the proxy (if missing) → expose it to the Docker bridge
(firewalled so it's not an open relay) → install Docker → wire Docker's daemon
and builds to the proxy → `git clone` your repo → `docker compose up --build -d`.
It's SSH-safe (no full tunnel) so it's fine to leave running through the long
`dlib` build.

When it finishes:
- **Frontend:** `http://45.159.113.73:3000`  (open port 3000 in your firewall:
  `ufw allow 3000/tcp`, or your provider's panel)
- **API/docs:** `http://127.0.0.1:8000/docs` (VPS-local; the frontend proxies to it)
- Manage: `cd /opt/face-auth && ./start.sh status|logs|stop|restart`

> Heads-up: your `docker-compose.yml` has a **Kavenegar API key hardcoded**
> (line 73). Since the repo is public, rotate that key and move it to an env
> file (`config.env`, which `.example` already hints at) rather than committing it.

## FlyVPN on this VPS
The FlyVPN **app** doesn't run on a headless server. To use FlyVPN here you need
their **OpenVPN config files**, which the Shadowsocks setup above makes
unnecessary — but if you want it as a fallback:

1. Log in to the FlyVPN member area and download the **OpenVPN (.ovpn)** config
   for a server you want.
2. On the VPS:
   ```bash
   apt update && apt install -y openvpn
   openvpn --config your-server.ovpn --daemon
   ```
   (It will prompt for the FlyVPN username/password.)

Note: routing the whole VPS through OpenVPN has the same SSH-lockout risk —
add `route 45.159.113.73 255.255.255.255 net_gateway` style excludes, or prefer
the Shadowsocks tunnel above which already handles that.

> Security tip: the FlyVPN account you shared is reused/shared. Change its
> password and avoid putting credentials in chat where possible.

---

## Troubleshooting
| Symptom | Fix |
|---------|-----|
| sing-box download fails | DNS is set first, so retry; or download `sing-box-1.9.7-linux-amd64.tar.gz` from the SourceForge mirror manually into `/tmp` and re-run. |
| `journalctl -u sing-box -n 50 --no-pager` | shows sing-box errors |
| proxy IP == real IP | Shadowsocks server may be down — test `nc -zv srv6.blueshadow.top 19921` |
| apt/docker still fail | `source /etc/profile.d/proxy.sh`, confirm `curl -x http://127.0.0.1:1081 https://google.com` works |
| undo everything | `systemctl disable --now sing-box; cp /etc/resolv.conf.orig /etc/resolv.conf` |

## Files
| file | purpose |
|------|---------|
| `setup-proxy.sh` | main installer (DNS + sing-box + Shadowsocks + local proxy + app config) |
| `enable-tunnel.sh` | turn on full transparent routing (arms 10-min auto-revert) |
| `confirm-tunnel.sh` | lock the tunnel in after you've verified it |
| `disable-tunnel.sh` | revert to safe SOCKS/HTTP-only mode |
