# IFA Backtest Engine — Production Credentials

**Deployed:** 2026-08-18 · **Host:** OVHcloud VPS Beauharnois, Canada
**Repo commit:** `a6523ca`
**File:** gitignored via `*.local` pattern — never commit

---

## 🌐 Live URL

**https://backtestingengine.insightfusionanalytics.com**

- Landing page (public): `/`
- Client sign-in: `/login`
- Admin sign-in: `/admin/login`
- Health check: `/healthz`
- OpenAPI docs: `/api/v1/docs` (dev — may 404 in prod)

---

## 🔑 Login Credentials

### 🔐 Admin console

| Field | Value |
|---|---|
| URL | https://backtestingengine.insightfusionanalytics.com/admin/login |
| Email | `insightfusionanalytics@gmail.com` |
| Password | *whatever you last set in Firebase console* |
| Fallback / placeholder | `ChangeMeOnFirstLogin!` (only if this is a completely fresh Firebase user; use the actual current one otherwise) |
| Role | `main_admin` |
| Sees | Pulse dashboard, all client drawers, engine registry, quote composer, content CMS, T&C editor, audit log, notifications |

### 👤 Sterling Capital Advisors — Demo client (no VAM)

| Field | Value |
|---|---|
| URL | https://backtestingengine.insightfusionanalytics.com/login |
| Email | `demo.client@sterlingcap.test` |
| Password | `DemoClient!2026` |
| Tier | Tier 1 (Starter) |
| Engagement | ENG-2026-0001 · Manual delivery |
| Has | 1 seed backtest (BT-2026-0001 — EMA 20/50 Crossover), 3 sample backtests |
| First login | Will be routed to `/terms` for T&C acceptance |

### 👤 Ravi — VAM engine client

| Field | Value |
|---|---|
| URL | https://backtestingengine.insightfusionanalytics.com/login |
| Email | `ravi@ifa.com` |
| Password | `Admin@2025` |
| Tier | Tier 3 (Enterprise) |
| VAM | **Enabled** — sees `+ New backtest` button + parameter tuning UI |
| Engine | ENG-VAM-001 (linked) |

---

## 🖥️ Infrastructure Credentials

### VPS (OVHcloud, Beauharnois Canada)

| Item | Value |
|---|---|
| IPv4 | `149.56.99.200` |
| IPv6 | `2607:5300:205:200::a6b9` |
| Hostname | `vps-6060320e.vps.ovh.ca` |
| OS | Ubuntu 26.04 |
| SSH user | `ubuntu` |
| SSH password | `1KBhfKF4sItH8N7J8EFE` *(rotated from OVH-provided at first login)* |
| SSH key | Claude's ed25519 key added to `/root/.ssh/authorized_keys` — remove when done |
| Sudo | `ubuntu` has passwordless sudo for docker, systemctl reload nginx, certbot |
| Firewall | UFW active — ports 22, 80, 443 only |

### Database (local Postgres on VPS)

| Item | Value |
|---|---|
| Container | `ifa-postgres` (Postgres 16 Alpine) |
| Host (inside Docker network) | `postgres:5432` |
| Database | `ifa` |
| User | `ifa` |
| Password | `6934aa0ce7caf80a42522caafc0ea243` |
| Volume | Named Docker volume `ifa-backtest-product_pgdata` |
| Backup command | `sudo docker exec ifa-postgres pg_dump -U ifa ifa \| gzip > backup-$(date +%F).sql.gz` |

### App secrets (all in `/opt/ifa-backtest-product/.env.production` on VPS, file mode `600`)

| Item | Value / Location |
|---|---|
| `APP_SECRET` (JWT signing) | Random 64-char hex generated during deploy — see `.env.production` on VPS |
| Firebase Project ID | `ifa-backtest-product` |
| Firebase Admin JSON | `/opt/ifa-backtest-product/backend/secrets/firebase-admin.json` (bind-mounted into backend container at `/app/backend/secrets/`) |
| Firebase Web API key | `AIzaSyD_CmcpWcgjk9QoWpE6lxat1PbQ_bVVU18` (baked into frontend bundle) |
| Storage | `local` (files on VPS disk — no Supabase Storage) |
| SSL cert | Let's Encrypt — auto-renews via `certbot.timer` |
| VAM engine base | `https://backtestravi.insightfusionanalytics.com` (external) |

---

## 🎬 Deploy / Ops Cheatsheet

```bash
# SSH in
ssh ubuntu@149.56.99.200

# Pull latest + redeploy
cd /opt/ifa-backtest-product
sudo bash deploy.sh

# Or manual:
sudo docker compose --env-file .env.production \
  -f docker-compose.prod.yml -f docker-compose.override.yml \
  build --no-cache && \
sudo docker compose --env-file .env.production \
  -f docker-compose.prod.yml -f docker-compose.override.yml \
  up -d --force-recreate

# Migrations
sudo docker compose --env-file .env.production \
  -f docker-compose.prod.yml -f docker-compose.override.yml \
  run --rm --workdir /app/backend backend alembic upgrade head

# Seed (idempotent)
sudo docker compose --env-file .env.production \
  -f docker-compose.prod.yml -f docker-compose.override.yml \
  run --rm --workdir /app/backend backend python -m app.seed

# Logs
sudo docker compose --env-file .env.production \
  -f docker-compose.prod.yml -f docker-compose.override.yml \
  logs -f backend

# Backup DB
sudo docker exec ifa-postgres pg_dump -U ifa ifa | gzip > ~/backup-$(date +%F).sql.gz
```

---

## 🚨 Must-Do This Week (Security)

1. **Rotate the Firebase Admin JSON.** The one shared in chat is compromised.
   - Firebase Console → Project settings → Service accounts → **Delete** key `56bf54995304676d826dbf972bb0897da1f708d5`
   - Generate new → `scp` to VPS at `/opt/ifa-backtest-product/backend/secrets/firebase-admin.json`
   - Restart backend: `sudo docker restart ifa-backend`

2. **Restrict the Firebase Web API key** in Google Cloud Console → Credentials:
   - HTTP referrer restrictions: `https://backtestingengine.insightfusionanalytics.com/*`
   - API restrictions: Identity Toolkit only

3. **Add domain to Firebase Authorized Domains**
   - Firebase Console → Authentication → Settings → Authorized domains
   - Add `backtestingengine.insightfusionanalytics.com`

4. **Change admin password** on first login (`insightfusionanalytics@gmail.com`) and enable 2FA.

5. **Remove Claude's SSH access** once done:
   ```bash
   ssh ubuntu@149.56.99.200 "sudo sed -i '/dhumalajinkya2004@gmail.com/d' /root/.ssh/authorized_keys"
   ```

6. **Lower DNS TTL** on the Hostinger DNS panel for `backtestingengine`:
   - Change TTL from `14400` → `300` so future changes propagate in 5 min instead of 4 hours.

7. **Set up weekly Postgres backup** via cron:
   ```bash
   # On the VPS, add to crontab (sudo crontab -e):
   0 3 * * 0 docker exec ifa-postgres pg_dump -U ifa ifa | gzip > /root/backups/ifa-$(date +\%F).sql.gz && find /root/backups -mtime +28 -delete
   ```

---

## 🔧 If your local Mac still can't reach the site

Your home router cached the old IP. Fix by switching DNS to Cloudflare:

**System Settings → Wi-Fi → Details → DNS → add `1.1.1.1` and `8.8.8.8` at top → Apply.** Then:

```bash
sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder
```

Or test from mobile hotspot to prove it's your Wi-Fi.

---

*File written 2026-08-18 · Delete or move to a password manager once you've read it.*
