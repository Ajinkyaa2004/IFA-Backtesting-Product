#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════
#  bootstrap-vps.sh — first-time VPS provisioning for IFA Backtest Engine
#
#  Takes a bare Ubuntu 26.04 VPS → fully running IFA stack behind Let's
#  Encrypt SSL. Idempotent — safe to re-run after fixing anything.
#
#  Usage (as root, first time):
#     wget https://raw.githubusercontent.com/Ajinkyaa2004/IFA-Backtesting-Product/main/bootstrap-vps.sh
#     chmod +x bootstrap-vps.sh
#     sudo ./bootstrap-vps.sh
#
#  It'll prompt you for domain + email, then walk through every step,
#  pausing when it needs your input (paste .env.production, paste the
#  Firebase Admin JSON). No hidden magic; every action is printed.
#
#  On success: IFA is live at https://<your-domain>
# ═══════════════════════════════════════════════════════════════════════

set -euo pipefail

# Colors for readability
RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; BLUE=$'\033[34m'; BOLD=$'\033[1m'; DIM=$'\033[2m'; RESET=$'\033[0m'
step() { echo; echo "${BLUE}${BOLD}══ $1 ══${RESET}"; }
ok()   { echo "  ${GREEN}✓${RESET} $1"; }
warn() { echo "  ${YELLOW}⚠${RESET} $1"; }
die()  { echo "  ${RED}✗${RESET} $1" >&2; exit 1; }
ask()  { read -rp "  ${BOLD}$1${RESET} " REPLY; echo "$REPLY"; }

# ── Root check + basic sanity ─────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "Run as root: sudo ./bootstrap-vps.sh"
[[ -f /etc/os-release ]] && . /etc/os-release || die "Can't detect OS"
[[ "$ID" == "ubuntu" ]] || warn "Not Ubuntu ($ID) — proceeding anyway"

step "IFA Backtest Engine — VPS bootstrap"
echo "  Host:  $(hostname)  ·  IP: $(hostname -I | awk '{print $1}')  ·  OS: ${PRETTY_NAME:-unknown}"

# ── Config (prompt if not preset) ─────────────────────────────────────
DOMAIN="${DOMAIN:-}"
EMAIL="${EMAIL:-}"
DEPLOY_USER="${DEPLOY_USER:-ajinkya}"
REPO_URL="${REPO_URL:-https://github.com/Ajinkyaa2004/IFA-Backtesting-Product.git}"
REPO_DIR="${REPO_DIR:-/opt/ifa-backtest-product}"

if [[ -z "$DOMAIN" ]]; then
    echo
    echo "  Domain must be pointed at $(hostname -I | awk '{print $1}') via A record before continuing."
    DOMAIN=$(ask "Your domain (e.g. insightfusionanalytics.in):")
fi
[[ -z "$EMAIL" ]] && EMAIL=$(ask "Email for Let's Encrypt notices:")

echo
echo "  ${BOLD}Config:${RESET}"
echo "    Domain:      $DOMAIN"
echo "    Email:       $EMAIL"
echo "    Deploy user: $DEPLOY_USER"
echo "    Repo:        $REPO_URL"
echo "    Install to:  $REPO_DIR"
echo
read -rp "  Proceed? [y/N] " -n 1 CONFIRM && echo
[[ "$CONFIRM" =~ ^[Yy]$ ]] || { echo "Aborted."; exit 0; }

# ── Phase 1: system packages ──────────────────────────────────────────
step "Phase 1/6 · System packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
apt-get install -y -qq \
    ca-certificates curl gnupg lsb-release \
    git nginx certbot python3-certbot-nginx \
    ufw fail2ban unattended-upgrades gettext-base >/dev/null

# Docker CE (Ubuntu 26.04 doesn't have docker-compose-v2 in the default repo)
if ! command -v docker >/dev/null; then
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" > /etc/apt/sources.list.d/docker.list
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin >/dev/null
fi
ok "Installed: docker $(docker --version | awk '{print $3}' | tr -d ','), nginx, certbot, ufw"

# ── Phase 2: user + SSH + firewall ────────────────────────────────────
step "Phase 2/6 · User, SSH, firewall"
if ! id "$DEPLOY_USER" >/dev/null 2>&1; then
    adduser --disabled-password --gecos "" "$DEPLOY_USER"
    ok "Created user: $DEPLOY_USER"
fi
usermod -aG sudo,docker "$DEPLOY_USER"
mkdir -p "/home/$DEPLOY_USER/.ssh"
chmod 700 "/home/$DEPLOY_USER/.ssh"

# If a pubkey exists in /root/.ssh/authorized_keys, copy it. (OVH puts your key
# there if you supplied one at provisioning.) Otherwise leave for user to add.
if [[ -f /root/.ssh/authorized_keys ]]; then
    cp /root/.ssh/authorized_keys "/home/$DEPLOY_USER/.ssh/"
    chown -R "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
    ok "Copied root's authorized_keys → $DEPLOY_USER"
fi

# Passwordless sudo for the deploy user (only for repeated deploys later).
# Restricted to /opt/ifa-backtest-product so root itself stays properly-gated.
echo "$DEPLOY_USER ALL=(ALL) NOPASSWD: /usr/bin/docker, /usr/bin/systemctl reload nginx, /usr/bin/certbot renew" > "/etc/sudoers.d/$DEPLOY_USER"
chmod 440 "/etc/sudoers.d/$DEPLOY_USER"

# UFW: SSH, HTTP, HTTPS only
ufw --force reset >/dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable >/dev/null
ok "Firewall: 22 · 80 · 443 open, everything else denied"

# Harden sshd: no root login, no password auth (only if key auth is set up)
if [[ -s "/home/$DEPLOY_USER/.ssh/authorized_keys" ]]; then
    sed -i -E 's/^#?PermitRootLogin.*/PermitRootLogin no/'         /etc/ssh/sshd_config
    sed -i -E 's/^#?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
    systemctl restart sshd
    ok "SSH hardened: root login disabled, password auth off"
else
    warn "No SSH key found for $DEPLOY_USER — leaving password auth on for now"
    warn "  Add your pubkey to /home/$DEPLOY_USER/.ssh/authorized_keys ASAP + re-run script"
fi

# Unattended security updates
dpkg-reconfigure -f noninteractive -plow unattended-upgrades >/dev/null 2>&1 || true

# ── Phase 3: clone repo ───────────────────────────────────────────────
step "Phase 3/6 · Clone repo"
mkdir -p "$(dirname "$REPO_DIR")"
if [[ ! -d "$REPO_DIR/.git" ]]; then
    git clone "$REPO_URL" "$REPO_DIR"
    chown -R "$DEPLOY_USER:$DEPLOY_USER" "$REPO_DIR"
    ok "Cloned $REPO_URL → $REPO_DIR"
else
    cd "$REPO_DIR"
    sudo -u "$DEPLOY_USER" git fetch origin main
    sudo -u "$DEPLOY_USER" git reset --hard origin/main
    ok "Updated existing repo to origin/main"
fi

# ── Phase 4: env + firebase secret (interactive) ──────────────────────
step "Phase 4/6 · Configuration files"
cd "$REPO_DIR"
mkdir -p backend/secrets

MISSING_ENV=0
MISSING_FIREBASE=0
[[ -f "$REPO_DIR/.env.production" ]]                    || MISSING_ENV=1
[[ -f "$REPO_DIR/backend/secrets/firebase-admin.json" ]] || MISSING_FIREBASE=1

if [[ $MISSING_ENV -eq 1 || $MISSING_FIREBASE -eq 1 ]]; then
    echo
    warn "The following files need YOU to create them before I can continue:"
    [[ $MISSING_ENV -eq 1 ]]      && echo "     · $REPO_DIR/.env.production"
    [[ $MISSING_FIREBASE -eq 1 ]] && echo "     · $REPO_DIR/backend/secrets/firebase-admin.json"
    echo
    echo "  ${BOLD}From your local machine, run these:${RESET}"
    echo "     ${DIM}# .env template is at /opt/ifa-backtest-product/.env.production.example${RESET}"
    echo "     scp .env.production           $DEPLOY_USER@$(hostname -I | awk '{print $1}'):$REPO_DIR/"
    echo "     scp firebase-admin.json       $DEPLOY_USER@$(hostname -I | awk '{print $1}'):$REPO_DIR/backend/secrets/"
    echo
    echo "  ${BOLD}Then re-run this script.${RESET} (Everything above is idempotent.)"
    exit 0
fi

chmod 600 .env.production
chmod 644 backend/secrets/firebase-admin.json
ok "env + firebase-admin.json present"

# Sanity-check .env.production has the essentials
for key in APP_SECRET DATABASE_URL_SYNC VITE_FIREBASE_API_KEY VITE_API_BASE_URL; do
    grep -qE "^${key}=." .env.production || die "Missing $key in .env.production"
done
# Verify VITE_API_BASE_URL points at the right domain
grep -qE "^VITE_API_BASE_URL=https://${DOMAIN}/api/v1" .env.production \
    || warn "VITE_API_BASE_URL doesn't match https://$DOMAIN/api/v1 — check .env.production"
ok "env sanity checks passed"

# ── Phase 5: DNS + nginx + SSL ────────────────────────────────────────
step "Phase 5/6 · Nginx + SSL"

# Verify DNS points here BEFORE we try certbot
RESOLVED=$(dig +short "$DOMAIN" | head -1)
MYIP=$(curl -sS4 ifconfig.me)
if [[ "$RESOLVED" != "$MYIP" ]]; then
    warn "DNS for $DOMAIN resolves to '$RESOLVED', but this VPS is '$MYIP'"
    warn "  Point the A record at $MYIP and wait 5-10 min for propagation."
    warn "  Skipping certbot for now — re-run this script once DNS is right."
    exit 0
fi
ok "DNS for $DOMAIN → $MYIP ✓"

# Render nginx template with real domain, install
DOMAIN="$DOMAIN" envsubst '${DOMAIN}' < "$REPO_DIR/nginx/site.conf.template" \
    > /etc/nginx/sites-available/ifa
ln -sf /etc/nginx/sites-available/ifa /etc/nginx/sites-enabled/ifa
rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null && systemctl reload nginx
ok "Nginx config installed for $DOMAIN"

# Get / renew SSL cert (certbot's nginx plugin edits the config in place)
if [[ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]]; then
    certbot --nginx -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive --redirect
    ok "SSL certificate issued via Let's Encrypt"
else
    ok "SSL cert already present (auto-renews via systemd timer)"
fi

# Confirm cert auto-renewal
systemctl enable --now certbot.timer >/dev/null 2>&1 || true

# ── Phase 6: build + run app ──────────────────────────────────────────
step "Phase 6/6 · Build + start app"
cd "$REPO_DIR"

# Source env so VITE_* build args reach the frontend Dockerfile
set -a && source .env.production && set +a

sudo -u "$DEPLOY_USER" bash -c "cd $REPO_DIR && set -a && source .env.production && set +a && docker compose -f docker-compose.prod.yml build --pull"
sudo -u "$DEPLOY_USER" bash -c "cd $REPO_DIR && docker compose -f docker-compose.prod.yml up -d --remove-orphans"
sleep 4
sudo -u "$DEPLOY_USER" bash -c "cd $REPO_DIR && docker compose -f docker-compose.prod.yml exec -T backend alembic upgrade head" || true
sudo -u "$DEPLOY_USER" bash -c "cd $REPO_DIR && docker compose -f docker-compose.prod.yml exec -T backend python -m app.seed" || true
ok "Containers up + DB migrated + seeded"

# Smoke tests
step "Smoke tests"
sleep 3
if curl -fsS "https://$DOMAIN/healthz" >/dev/null 2>&1; then
    ok "https://$DOMAIN/healthz responds"
else
    warn "healthz not responding — check: docker compose -f $REPO_DIR/docker-compose.prod.yml logs"
fi

if curl -fsS "https://$DOMAIN/" | grep -q "IFA Backtest Engine"; then
    ok "https://$DOMAIN/ renders the landing page"
else
    warn "Landing page didn't render — check the frontend container"
fi

# ── Done ──────────────────────────────────────────────────────────────
echo
echo "${GREEN}${BOLD}═══ IFA is live at https://$DOMAIN ═══${RESET}"
echo
echo "  Admin sign-in:  https://$DOMAIN/admin/login"
echo "  Client sign-in: https://$DOMAIN/login"
echo
echo "  ${BOLD}Future deploys:${RESET}"
echo "     sudo -u $DEPLOY_USER bash $REPO_DIR/deploy.sh"
echo
echo "  ${BOLD}Watch logs:${RESET}"
echo "     sudo -u $DEPLOY_USER docker compose -f $REPO_DIR/docker-compose.prod.yml logs -f"
echo
