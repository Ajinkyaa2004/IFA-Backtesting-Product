# VPS Handoff — OVHcloud Beauharnois

**Purpose:** Paste this at the top of a new chat when you want to deploy another project to the same VPS. It gives full context so an assistant can proceed without re-discovering everything.

---

## 🖥️ VPS access

| Field | Value |
|---|---|
| **Provider** | OVHcloud, Beauharnois (Canada) |
| **Plan** | VPS-3 2027 · 6 vCPU · 12 GB RAM · 100 GB SSD |
| **IPv4** | `149.56.99.200` |
| **IPv6** | `2607:5300:205:200::a6b9` |
| **Hostname** | `vps-6060320e.vps.ovh.ca` |
| **OS** | Ubuntu 26.04 LTS (resolute) |
| **Kernel** | 7.0.0-14-generic |

### SSH

```bash
ssh ubuntu@149.56.99.200
```

- **Login user:** `ubuntu` (has passwordless sudo for docker, systemctl reload nginx, certbot)
- **Password:** `1KBhfKF4sItH8N7J8EFE` *(rotated from OVH-provided at first login; save to password manager)*
- **Root SSH:** enabled but only Claude's ed25519 key is authorized; recommend disabling once you don't need it
- **Add your own SSH key** for passwordless login:
  ```bash
  ssh-copy-id ubuntu@149.56.99.200
  ```

---

## 📊 Current resource usage (headroom for more projects)

| Resource | Total | Used | Free | Free % |
|---|---|---|---|---|
| RAM | 12 GB | 1.0 GB | 10 GB | **83%** |
| Disk (/) | 96 GB | 7.1 GB | 89 GB | **93%** |
| CPU cores | 6 | idle (0.06 load) | ~6 | **100%** |
| Swap | 0 | — | — | — |

**Comfort budget for new projects on this box:**
- Small Node/Python app (1 GB RAM, 5-10 GB disk): can host **8-10 more** easily
- Medium app (2-3 GB RAM, 20 GB disk): can host **3-4 more**
- Heavy app (Selenium/browser automation): each ~1-2 GB RAM, plan accordingly

---

## 🔧 What's installed system-wide

| Tool | Version | Notes |
|---|---|---|
| **Docker CE** | 29.7.2 | with buildx + compose plugin |
| **Docker Compose** | v5.4.0 | plugin, use `docker compose` |
| **Nginx** | 1.28.3 | reverse proxy for all sites |
| **Certbot** | 4.0.0 | auto-renewal enabled via `certbot.timer` (daily) |
| **UFW** | 0.36.2 | active — only ports 22, 80, 443 allowed |
| **fail2ban** | (installed) | brute-force protection on SSH |
| **Python 3** | 3.14.4 | system default |
| **git** | (installed) | |

Auto system updates run daily via `apt-daily-upgrade.timer`.

---

## 🔌 Ports in use — what's TAKEN

| Port | Bound to | Service |
|---|---|---|
| 22 | `0.0.0.0` | SSH |
| 80 | `0.0.0.0` | nginx (auto-redirects to 443) |
| 443 | `0.0.0.0` | nginx (SSL termination for all sites) |
| **5173** | `127.0.0.1` (localhost only) | `ifa-frontend` container |
| **8000** | `127.0.0.1` (localhost only) | `ifa-backend` container |
| **5432** | Docker network only | `ifa-postgres` container (not reachable from outside) |

**Free localhost ports you can use for new project containers:**
- **Frontend:** 5174, 5175, 5176, … 5199
- **Backend:** 8001, 8002, … 8099
- **Databases:** 5433, 5434, … (keep in docker network only)
- **Anything else:** any port between 1024–65535 that isn't listed above

**External ports** (80, 443) are shared — every new site adds itself as an nginx `server_name` block on the same 443.

---

## 📦 Currently deployed apps

### IFA Backtest Engine

- **URL:** https://backtestingengine.insightfusionanalytics.com
- **Location:** `/opt/ifa-backtest-product/`
- **Docker Compose files:** `docker-compose.prod.yml` + `docker-compose.override.yml` (adds local postgres)
- **Containers:** `ifa-frontend` (port 5173), `ifa-backend` (port 8000), `ifa-postgres` (docker-network only)
- **Data volume:** `ifa-backtest-product_pgdata`
- **Env file:** `/opt/ifa-backtest-product/.env.production` (mode 600)
- **Firebase Admin:** `/opt/ifa-backtest-product/backend/secrets/firebase-admin.json`
- **Nginx site:** `/etc/nginx/sites-enabled/ifa` (managed by certbot)
- **SSL cert:** `/etc/letsencrypt/live/backtestingengine.insightfusionanalytics.com/` (expires 2026-11-16, auto-renews)

---

## 🚀 How to deploy a NEW project on this VPS

Reusable template. Assume the new project is called `myapp` at `https://myapp.example.com`.

### Step 1 — DNS

Point `myapp.example.com` (or wherever) → `149.56.99.200` via A record. TTL 300.

### Step 2 — Clone the project

```bash
ssh ubuntu@149.56.99.200
sudo mkdir -p /opt/myapp
sudo chown ubuntu:ubuntu /opt/myapp
cd /opt
git clone <your-repo> myapp
cd myapp
```

### Step 3 — Set up docker-compose

Your `docker-compose.yml` should bind app ports to `127.0.0.1` (not `0.0.0.0`) — nginx does the internet-facing SSL. Example:

```yaml
services:
  myapp-backend:
    ...
    ports:
      - "127.0.0.1:8001:8000"   # pick any free port
  myapp-frontend:
    ...
    ports:
      - "127.0.0.1:5174:80"     # pick any free port
```

Then:
```bash
sudo docker compose --env-file .env.production up -d
```

### Step 4 — Nginx reverse proxy

Create `/etc/nginx/sites-available/myapp` (borrow from IFA's template at `/opt/ifa-backtest-product/nginx/site.conf.template`):

```nginx
server {
    listen 80;
    server_name myapp.example.com;

    # Security headers (copy from IFA config for consistency)
    add_header Strict-Transport-Security "max-age=15552000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;

    location / {
        proxy_pass http://127.0.0.1:5174;   # your frontend container's port
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8001;   # your backend container's port
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        client_max_body_size 25M;
    }
}
```

Enable + reload:
```bash
sudo ln -s /etc/nginx/sites-available/myapp /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

### Step 5 — SSL cert

```bash
sudo certbot --nginx -d myapp.example.com --email your@email.com --agree-tos --non-interactive --redirect
```

Certbot auto-edits nginx to add SSL + auto-renewal is already scheduled (`certbot.timer` runs daily).

### Step 6 — Smoke test

```bash
curl -sSI https://myapp.example.com/
curl -sSI https://myapp.example.com/api/healthz
```

**That's it.** Site is live.

---

## 🗃️ Shared infrastructure patterns

### Reusing Postgres

The `ifa-postgres` container is only reachable inside the `ifa-backtest-product_default` Docker network. If your new app wants to reuse it (not recommended — better to run your own postgres per app for isolation), you can join the network:

```yaml
services:
  myapp:
    ...
    networks:
      - ifa-backtest-product_default
    environment:
      DATABASE_URL: postgresql://<user>:<pw>@ifa-postgres:5432/mydb  # create db first

networks:
  ifa-backtest-product_default:
    external: true
```

**Recommended:** each app runs its own postgres container. Named volumes keep them isolated. Costs ~50 MB RAM per postgres instance.

### Environment variable pattern

```bash
# Always use --env-file explicitly with docker compose
sudo docker compose --env-file .env.production build --no-cache
sudo docker compose --env-file .env.production up -d
```

**Why:** `sudo` strips shell env by default, so `source .env.production` doesn't propagate. `--env-file` is the reliable pattern.

### Build args for Vite / build-time secrets

If your frontend uses Vite (build-time env vars), your `docker-compose.yml` needs `args:` under build:

```yaml
services:
  frontend:
    build:
      context: .
      args:
        VITE_API_BASE_URL: ${VITE_API_BASE_URL}
        VITE_SOMETHING: ${VITE_SOMETHING}
```

And your `Dockerfile` needs `ARG` + `ENV`:
```dockerfile
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
RUN npm run build
```

### CSP + external stylesheets

If your app imports fonts from Google (or any external stylesheet), nginx CSP needs to allow it:

```nginx
add_header Content-Security-Policy "default-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; ..." always;
```

---

## 🛡️ Security posture (what's set up)

- ✅ UFW firewall — only 22, 80, 443 open
- ✅ fail2ban — SSH brute-force protection
- ✅ Auto system security updates (`unattended-upgrades`)
- ✅ SSH: `ubuntu` user with passwordless sudo (scoped to docker/nginx/certbot)
- ✅ Docker + nginx run as system services
- ✅ Certbot auto-renewal (systemd timer, daily)
- ✅ Every app container binds to `127.0.0.1` — internet only reaches them through nginx
- ⚠️ **Root SSH:** still enabled (with Claude's key added). Disable when done:
  ```bash
  sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
  sudo systemctl restart sshd
  ```
- ⚠️ **Ubuntu user password auth:** still enabled. Once you have SSH key set up, disable password auth:
  ```bash
  sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  sudo systemctl restart sshd
  ```
- ⚠️ **No off-VPS backups yet.** Set up a Postgres backup cron + rsync/rclone to S3/B2/Dropbox.

---

## 🐛 Gotchas discovered during IFA deploy

1. **OVH forces a password change on first login.** Handle via expect script OR log in interactively first.
2. **Ubuntu 26.04 doesn't have docker-compose-v2 in the default repo.** Install Docker CE from Docker's own repo (see IFA `bootstrap-vps.sh` for exact commands).
3. **Python venv refuses paths with `:` in them.** If your app has that in its path, put the venv in `$HOME/.venvs/` instead.
4. **`sudo` strips VITE_* env vars.** Always use `docker compose --env-file .env.production` explicitly.
5. **DNS TTL 14400 = 4-hour propagation.** Lower to 300 for anything you might change.
6. **Supabase free-tier projects auto-purge after inactivity.** If you rely on Supabase, ping it weekly OR upgrade to Pro.
7. **`sudo -E` is ignored on this Ubuntu.** Use `sudo env VAR=value command` OR `--env-file`.
8. **Docker daemon runs as root; ubuntu user needs the docker group.** Already set up. New sessions need `newgrp docker` OR log out+in.
9. **Certbot's --nginx plugin auto-edits your config.** It works but wraps your server block — verify with `sudo nginx -T` after.
10. **Frontend on Vite needs build-time env vars baked in.** Not runtime. Rebuild + recreate container after env changes.

---

## 📋 Prompt to paste in a new chat for the next deploy

Copy this block into a new Claude chat when you want to deploy another project:

> I have an OVHcloud VPS with these details — please deploy `<PROJECT_NAME>` on it.
>
> **VPS:** `ubuntu@149.56.99.200` (Ubuntu 26.04, 6 vCPU, 12 GB RAM, 89 GB disk free)
> **SSH password:** `1KBhfKF4sItH8N7J8EFE`
> **Already installed:** Docker 29.7.2, nginx 1.28.3, certbot 4.0.0, UFW active (22/80/443 only)
> **Already running:** IFA Backtest Engine at `https://backtestingengine.insightfusionanalytics.com` (uses ports 5173, 8000, 5432 on localhost)
>
> **My new project:**
> - Repo: `<git URL>`
> - Domain: `<subdomain>.<domain>.com` (DNS already pointed at 149.56.99.200)
> - Stack: `<Node / Python / etc>`
> - Ports it needs: `<pick free ports — see VPS_HANDOFF.md>`
> - Needs postgres? `<yes/no>`
> - Environment vars needed: paste `.env.production` template
>
> Follow the "How to deploy a NEW project" pattern from VPS_HANDOFF.md. My SSH key is already on the box (or add it). Verify with a live curl to the domain when done.

---

*File written 2026-08-19 · Move to password manager once read.*
