#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# IFA Portal - VPS health check
# ─────────────────────────────────────────────────────────────────────────────
# Runs every 15 minutes via systemd timer. Checks a handful of infrastructure
# invariants; each failure fires an alert email through the backend's Python
# alerter (uses Gmail SMTP) so ops sees it before customers do.
#
# Runs on the VPS itself, so it only catches problems while the VPS is up.
# The "VPS is completely offline" case is caught separately by an external
# uptime monitor (UptimeRobot) that pings from outside.
#
# Every check is best-effort: a failure inside the check itself is logged but
# does NOT stop the rest of the checks from running.
#
# Requires:
#   - /etc/ifa/healthcheck.env with the renewal dates + thresholds
#   - the ifa-backend container running (used to send email via Python alerter)
#
# Log lands at /var/log/ifa-healthcheck.log
# ─────────────────────────────────────────────────────────────────────────────

set -u

CFG=/etc/ifa/healthcheck.env
LOG=/var/log/ifa-healthcheck.log
NOW="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"

log() { echo "[$NOW] $*" | tee -a "$LOG"; }

if [ -f "$CFG" ]; then
  # shellcheck source=/dev/null
  . "$CFG"
else
  log "MISSING config: $CFG - using defaults"
fi

# Defaults - override via /etc/ifa/healthcheck.env
DISK_THRESHOLD_PCT="${DISK_THRESHOLD_PCT:-85}"
RAM_THRESHOLD_PCT="${RAM_THRESHOLD_PCT:-90}"
RENEWAL_WARN_DAYS="${RENEWAL_WARN_DAYS:-30 14 7 3 1}"
CERT_WARN_DAYS="${CERT_WARN_DAYS:-30}"
CONTAINERS="${CONTAINERS:-ifa-postgres ifa-backend ifa-frontend ifa-vam-engine}"
CERT_DOMAIN="${CERT_DOMAIN:-backtestingengine.insightfusionanalytics.com}"
# YYYY-MM-DD dates for the OVH VPS + Hostinger domain renewals. Update these
# after each renewal; if unset, the renewal checks are skipped silently.
VPS_RENEWAL_DATE="${VPS_RENEWAL_DATE:-}"
DOMAIN_RENEWAL_DATE="${DOMAIN_RENEWAL_DATE:-}"

# ── Persistent dedupe state ─────────────────────────────────────────────────
#
# The Python alerter's in-process dedupe dict resets every time we `docker exec`
# because that spawns a fresh interpreter. Result: chronic conditions (renewal
# countdown, low-disk warnings, etc.) refire every cron tick and spam the inbox.
# Fix: track fingerprints in a state file on the host that survives cron runs.
STATE_DIR=/var/lib/ifa
STATE_FILE="$STATE_DIR/alert-state"
mkdir -p "$STATE_DIR" 2>/dev/null || true
touch "$STATE_FILE" 2>/dev/null || true

# Default cooldown windows (seconds). Override in /etc/ifa/healthcheck.env.
# Rate-limit alerts by "kind" (each metric name). Renewal alerts get a long
# window so we get exactly one email per threshold day; ops warnings get a
# shorter window so an ongoing condition emails a few times per day.
: "${RENEWAL_COOLDOWN_S:=$((23*3600))}"       # ~24h - one email per threshold day
: "${WARNING_COOLDOWN_S:=$((6*3600))}"        # 6h - a chronic warning fires 4x/day

_cooldown_for() {
  case "$1" in
    vps_renewal|domain_renewal) echo "$RENEWAL_COOLDOWN_S" ;;
    *) echo "$WARNING_COOLDOWN_S" ;;
  esac
}

# ── Emitter ─────────────────────────────────────────────────────────────────
#
# Alerts are sent by invoking the Python alerter inside the ifa-backend
# container. Piggybacks on the platform's Gmail SMTP config so we don't
# duplicate SMTP creds on the host. Deduped via $STATE_FILE so repeated cron
# ticks over a chronic condition don't spam.
emit_alert() {
  local metric="$1" value="$2" threshold="$3" hint="${4:-}"
  local fp cooldown last_sent now delta
  now=$(date +%s)
  # Fingerprint: metric + value (so a threshold change re-fires, but the same
  # value refiring every tick does not).
  fp="${metric}::${value}"
  cooldown=$(_cooldown_for "$metric")
  # last_sent for this fingerprint (or 0 if never)
  last_sent=$(grep -F "$fp " "$STATE_FILE" 2>/dev/null | tail -1 | awk '{print $NF}')
  last_sent=${last_sent:-0}
  delta=$(( now - last_sent ))
  if [ "$last_sent" -gt 0 ] && [ "$delta" -lt "$cooldown" ]; then
    log "DEDUPE alert ($metric=$value) - fired ${delta}s ago, cooldown ${cooldown}s"
    return 0
  fi

  # If the backend container is down, we can't send. Log and skip - the
  # external uptime monitor will page separately.
  if ! docker ps --format '{{.Names}}' | grep -q '^ifa-backend$'; then
    log "SKIP alert ($metric) - ifa-backend container not running"
    return 0
  fi

  local payload
  payload=$(python3 -c "
import json,sys
print(json.dumps({
  'metric': sys.argv[1], 'value': sys.argv[2],
  'threshold': sys.argv[3], 'hint': sys.argv[4]
}))
" "$metric" "$value" "$threshold" "$hint")

  # shellcheck disable=SC2181
  if docker exec -e IFA_ALERT_PAYLOAD="$payload" ifa-backend python -c "
import os, json, sys
sys.path.insert(0, '/app/backend')
from app.services.alerts import send_health_alert
p = json.loads(os.environ['IFA_ALERT_PAYLOAD'])
send_health_alert(p['metric'], p['value'], p['threshold'], p['hint'])
" >> "$LOG" 2>&1; then
    # Mark this fingerprint as fired NOW so cron doesn't repeat it during
    # the cooldown window. Written before we care about email success -
    # dedupe on intent, not delivery.
    # Prune stale entries: keep only lines newer than 30 days to stop the
    # file from growing forever.
    local cutoff=$(( now - 30 * 86400 ))
    (
      grep -F -v "$fp " "$STATE_FILE" 2>/dev/null \
        | awk -v cutoff="$cutoff" '$NF >= cutoff'
      echo "$fp $now"
    ) > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"
    log "SENT alert ($metric=$value)"
  else
    log "FAILED to emit alert ($metric=$value)"
  fi
}

# ── Disk usage ──────────────────────────────────────────────────────────────
DISK_PCT=$(df --output=pcent / | tail -1 | tr -d ' %')
if [ "${DISK_PCT:-0}" -ge "$DISK_THRESHOLD_PCT" ]; then
  emit_alert "disk_high" "${DISK_PCT}%" "${DISK_THRESHOLD_PCT}%" \
    "Disk / on the VPS is above the alert threshold. Docker images, logs and postgres data are the usual culprits. Run: sudo du -sh /var/lib/docker /var/log/* /opt/ifa-backtest-product"
  log "ALERT disk_high: ${DISK_PCT}%"
else
  log "OK disk: ${DISK_PCT}%"
fi

# ── RAM usage ──────────────────────────────────────────────────────────────
# Read /proc/meminfo directly - portable across distros and doesn't fork awk.
MEM_TOTAL=$(grep -m1 '^MemTotal:' /proc/meminfo | tr -s ' ' | cut -d' ' -f2)
MEM_AVAIL=$(grep -m1 '^MemAvailable:' /proc/meminfo | tr -s ' ' | cut -d' ' -f2)
if [ -n "${MEM_TOTAL:-}" ] && [ -n "${MEM_AVAIL:-}" ] && [ "$MEM_TOTAL" -gt 0 ]; then
  MEM_USED=$(( MEM_TOTAL - MEM_AVAIL ))
  RAM_PCT=$(( 100 * MEM_USED / MEM_TOTAL ))
  if [ "$RAM_PCT" -ge "$RAM_THRESHOLD_PCT" ]; then
    emit_alert "ram_high" "${RAM_PCT}%" "${RAM_THRESHOLD_PCT}%" \
      "Available RAM under threshold. Check: docker stats. Common causes: a runaway container, memory leak in the vam-engine, or too many WordPress workers."
    log "ALERT ram_high: ${RAM_PCT}%"
  else
    log "OK ram: ${RAM_PCT}%"
  fi
fi

# ── Containers healthy ─────────────────────────────────────────────────────
for name in $CONTAINERS; do
  # docker inspect returns "healthy" for containers with a HEALTHCHECK,
  # "starting" during boot, or "" for containers without one. If the
  # container is missing entirely, docker inspect returns nothing.
  if ! docker ps --format '{{.Names}}' | grep -q "^${name}$"; then
    emit_alert "container_down" "$name" "running" \
      "Container ${name} is not in docker ps. Bring it back with: cd /opt/ifa-backtest-product && sudo docker compose --env-file .env.production -f docker-compose.prod.yml -f docker-compose.override.yml up -d ${name#ifa-}"
    log "ALERT container_down: $name"
    continue
  fi
  HEALTH=$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}no-hc{{end}}' "$name" 2>/dev/null || echo "unknown")
  # "no-hc" means the container has no HEALTHCHECK - not an alert condition.
  # "starting" is transient - the container is boot-checking - not an alert.
  if [ "$HEALTH" = "unhealthy" ]; then
    emit_alert "container_unhealthy" "$name" "healthy" \
      "Container ${name} reports 'unhealthy' from its HEALTHCHECK. Read its logs: sudo docker logs --tail 100 ${name}"
    log "ALERT container_unhealthy: $name"
  else
    log "OK container: $name ($HEALTH)"
  fi
done

# ── SSL cert expiry ────────────────────────────────────────────────────────
CERT_DAYS=$(echo | openssl s_client -servername "$CERT_DOMAIN" -connect "${CERT_DOMAIN}:443" 2>/dev/null \
  | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
if [ -n "$CERT_DAYS" ]; then
  CERT_EXPIRY_EPOCH=$(date -d "$CERT_DAYS" +%s 2>/dev/null || echo 0)
  NOW_EPOCH=$(date +%s)
  DAYS_LEFT=$(( (CERT_EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
  if [ "$DAYS_LEFT" -lt "$CERT_WARN_DAYS" ]; then
    emit_alert "cert_expiring" "${DAYS_LEFT}d" "${CERT_WARN_DAYS}d" \
      "SSL cert for ${CERT_DOMAIN} expires in ${DAYS_LEFT} days. certbot should auto-renew but is not. Check: sudo systemctl list-timers | grep certbot"
    log "ALERT cert_expiring: ${DAYS_LEFT}d"
  else
    log "OK cert: ${DAYS_LEFT}d until expiry"
  fi
fi

# ── VPS renewal date ───────────────────────────────────────────────────────
# ── Domain renewal date ────────────────────────────────────────────────────
check_renewal() {
  local kind="$1" date_str="$2" label="$3"
  [ -z "$date_str" ] && { log "SKIP $kind renewal - no date configured"; return; }
  local expiry_epoch now_epoch days_left
  expiry_epoch=$(date -d "$date_str" +%s 2>/dev/null || echo 0)
  [ "$expiry_epoch" = "0" ] && { log "SKIP $kind renewal - bad date '$date_str'"; return; }
  now_epoch=$(date +%s)
  days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

  # Pick the smallest threshold that days_left is <= to. That's the "band"
  # we're currently in. The fingerprint (metric=band-value) then makes sure
  # we send one email when we enter each band - not one per cron tick within
  # the band. e.g. entering the "14d" band -> 1 email; sitting in "14d" for
  # a full day -> 0 additional emails; crossing into "7d" -> 1 new email.
  local band=""
  for threshold in $RENEWAL_WARN_DAYS; do
    if [ "$days_left" -le "$threshold" ]; then
      # Choose the tightest band this value crosses into.
      if [ -z "$band" ] || [ "$threshold" -lt "$band" ]; then
        band="$threshold"
      fi
    fi
  done

  if [ -n "$band" ]; then
    emit_alert "${kind}_renewal" "${band}d" "${band}d" \
      "${label} renewal date ${date_str} is ${days_left} days away. Renew NOW - a repeat of the recent VPS outage would be avoidable."
    log "IN-BAND ${kind}_renewal band=${band}d actual=${days_left}d"
  else
    log "OK ${kind}_renewal: ${days_left}d until ${date_str}"
  fi
}

check_renewal "vps"    "$VPS_RENEWAL_DATE"    "OVH VPS"
check_renewal "domain" "$DOMAIN_RENEWAL_DATE" "Hostinger domain"

# ── Postgres reachability ──────────────────────────────────────────────────
if docker ps --format '{{.Names}}' | grep -q '^ifa-postgres$'; then
  if ! docker exec ifa-postgres pg_isready -U ifa -d ifa >/dev/null 2>&1; then
    emit_alert "postgres_unreachable" "not ready" "ready" \
      "pg_isready failed against ifa-postgres. Backend queries will fail. Check: sudo docker logs --tail 100 ifa-postgres"
    log "ALERT postgres_unreachable"
  else
    log "OK postgres: ready"
  fi
fi

# ── VAM engine reachability (from inside the backend container's network) ──
if docker ps --format '{{.Names}}' | grep -q '^ifa-vam-engine$'; then
  if ! docker exec ifa-backend curl -fsS -m 5 http://vam-engine:8000/api/data-source >/dev/null 2>&1; then
    emit_alert "vam_offline" "unreachable" "reachable" \
      "The VAM engine is not answering its /api/data-source probe from inside the docker network. Ravi's runs will fail. Check: sudo docker logs --tail 100 ifa-vam-engine"
    log "ALERT vam_offline"
  else
    log "OK vam-engine: reachable"
  fi
fi

log "healthcheck complete"
exit 0
