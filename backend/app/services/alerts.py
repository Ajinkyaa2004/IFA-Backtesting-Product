"""Platform alert emails.

Fires operational alerts to the admin address whenever something on the
platform breaks or looks unhealthy. Every alert lands as one email in a single
stream so ops sees the full picture without hunting.

Alert kinds
-----------
* ``exception``     - a 500 escaped a request handler
* ``vam_offline``   - Ravi's VAM engine failed a health probe
* ``smtp_failure``  - our own outbound Gmail SMTP is failing
* ``storage_error`` - Supabase/local storage upload/download broke
* ``firebase_down`` - Firebase Admin can't verify tokens
* ``disk_high``     - VPS disk usage above threshold
* ``ram_high``      - VPS RAM usage above threshold
* ``container_down``- one of the 6 IFA containers isn't healthy
* ``cert_expiring`` - SSL cert expires soon
* ``vps_renewal``   - OVH VPS renewal date approaching
* ``domain_renewal``- Hostinger domain renewal date approaching
* ``postgres_unreachable`` - DB connection failed the health probe
* ``manual``        - hand-fired for a custom situation

Send target
-----------
Every alert is sent to both admin recipients:
  - dhumalajinkya2004@gmail.com  (Ajinkya)
  - insightfusionanalytics@gmail.com (business inbox)

Rate limiting
-------------
The same alert kind + fingerprint can only fire once per 15 minutes. Prevents
a broken endpoint from spamming the inbox 100x while a client hits refresh.
The rate-limit state lives in-process; a restart clears it (fine - it's a
best-effort dedupe, not a compliance control).

Fire-and-forget
---------------
Every helper catches its own exceptions and logs them. Never propagates.
An alert path breaking must not break the request path it was reporting on.
"""

from __future__ import annotations

import hashlib
import platform
import socket
import time
import traceback as _traceback_mod
from datetime import datetime, timezone
from typing import Any

from loguru import logger

from app.core.config import get_settings
from app.services.email import _send  # reuse the SMTP helper


# ── Recipients ─────────────────────────────────────────────────────────────

ALERT_RECIPIENTS: list[str] = [
    "dhumalajinkya2004@gmail.com",
    "insightfusionanalytics@gmail.com",
]


# ── Rate limiting (in-process, 15 min per fingerprint) ─────────────────────

_RATE_LIMIT_SECONDS = 15 * 60
_last_sent: dict[str, float] = {}


def _fingerprint(kind: str, key: str) -> str:
    """Stable dedupe key per (alert_kind, distinct_reason).

    Two alerts with the same fingerprint within _RATE_LIMIT_SECONDS collapse
    into one email. Choose `key` narrowly enough that distinct problems don't
    dedupe together (e.g. include endpoint path + exception class), but broad
    enough that the same problem hit 20 times in a row emits once.
    """
    return hashlib.sha256(f"{kind}::{key}".encode()).hexdigest()[:16]


def _should_send(fingerprint: str) -> bool:
    now = time.time()
    prev = _last_sent.get(fingerprint)
    if prev is not None and now - prev < _RATE_LIMIT_SECONDS:
        return False
    _last_sent[fingerprint] = now
    return True


# ── Severity → visual sty ling ─────────────────────────────────────────────

_SEVERITY_STYLES = {
    "critical": {"emoji": "🔴", "color": "#dc2626", "label": "CRITICAL"},
    "warning":  {"emoji": "🟡", "color": "#d97706", "label": "WARNING"},
    "info":     {"emoji": "🔵", "color": "#2563eb", "label": "INFO"},
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")


# ── Public API ──────────────────────────────────────────────────────────────

def send_platform_alert(
    kind: str,
    subject: str,
    what_happened: str,
    likely_cause: str = "",
    what_to_do: str = "",
    context: dict[str, Any] | None = None,
    severity: str = "critical",
    dedupe_key: str = "",
) -> bool:
    """Fire an alert. Returns True if an email was sent, False if deduped/skipped.

    Fields shape the standard IFA alert email body. Consistent format makes
    triage scannable at 3am.
    """
    style = _SEVERITY_STYLES.get(severity, _SEVERITY_STYLES["critical"])

    dedupe = dedupe_key or kind
    fp = _fingerprint(kind, dedupe)
    if not _should_send(fp):
        logger.debug("Alert deduped (fp={} recent): {}", fp, subject)
        return False

    try:
        text_body, html_body = _render(
            kind, subject, what_happened, likely_cause, what_to_do,
            context or {}, style,
        )
        subj = f"{style['emoji']} IFA Portal - {subject}"
        ok = True
        for to in ALERT_RECIPIENTS:
            sent = _send(to, subj, text_body, html_body)
            ok = ok and sent
        logger.info("Alert emitted kind={} recipients={} ok={}", kind, ALERT_RECIPIENTS, ok)
        return ok
    except Exception as e:
        logger.exception("Alert send itself blew up (kind={}): {}", kind, e)
        return False


def send_exception_alert(
    exc: BaseException,
    request_path: str | None = None,
    request_method: str | None = None,
    user_email: str | None = None,
    client_id: str | None = None,
) -> None:
    """Convenience wrapper for the FastAPI global-exception handler.

    Dedupe key = exception class + endpoint so repeated hits during a hot
    incident don't spam. Distinct errors on distinct endpoints still fan out.
    """
    tb = _traceback_mod.format_exc()
    exc_class = type(exc).__name__
    exc_msg = str(exc)[:400]

    ctx: dict[str, Any] = {
        "Exception class": exc_class,
        "Exception message": exc_msg,
        "Request": f"{request_method or '-'} {request_path or '-'}",
        "User": user_email or "-",
        "Client id": client_id or "-",
        "Host": socket.gethostname(),
    }

    send_platform_alert(
        kind="exception",
        subject=f"Uncaught {exc_class} on {request_path or 'unknown endpoint'}",
        what_happened=(
            f"A request handler raised an unhandled {exc_class}. "
            f"The client received a 500 error."
        ),
        likely_cause=_guess_cause(exc_class, exc_msg),
        what_to_do=(
            "1. SSH the VPS and read the backend log:\n"
            "   ssh ubuntu@backtestingengine.insightfusionanalytics.com\n"
            "   sudo docker logs --tail 100 ifa-backend\n"
            "2. Search for the traceback below.\n"
            "3. Fix + redeploy: cd /opt/ifa-backtest-product && ./deploy.sh backend"
        ),
        context={**ctx, "Traceback": tb[-2400:]},  # last 2.4KB is plenty
        severity="critical",
        dedupe_key=f"{exc_class}::{request_path or ''}",
    )


def _guess_cause(exc_class: str, exc_msg: str) -> str:
    """Pattern-match common failure modes so the email has a suggested cause.

    Keeps ops from staring at a bare stack trace.
    """
    m = exc_msg.lower()
    if "database" in m or "postgres" in m or "psycopg" in m or "operationalerror" in m:
        return "Postgres reachability or query problem. Check `docker ps` (is ifa-postgres healthy?) and `docker logs ifa-postgres`."
    if "storage" in m or "supabase" in m or "s3" in m:
        return "Supabase/local storage failure. Check STORAGE_BACKEND env, Supabase project status, and `docker logs ifa-backend | grep storage`."
    if "firebase" in m or "id token" in m or "verify_id_token" in m:
        return "Firebase Admin verification failed. Check firebase-admin.json bind-mount + FIREBASE_PROJECT_ID env."
    if "vam" in m or "backtestravi" in m or "vam-engine" in m:
        return "VAM engine unreachable or 5xx. Check `docker ps` for ifa-vam-engine and its logs."
    if "smtp" in m or "gmail" in m:
        return "Outbound email broken. Check Gmail App Password + SMTP_HOST/PORT env vars."
    if exc_class in ("TimeoutError", "ReadTimeout", "ConnectTimeout"):
        return "An upstream call timed out. Something we depend on is slow or offline."
    if exc_class == "ValidationError":
        return "Pydantic validation. Usually a client sent a malformed payload - not necessarily our bug."
    if exc_class in ("KeyError", "AttributeError"):
        return "Programming bug - missing field or None where an object was expected."
    return "No auto-guess. Read the traceback below for the actual source location."


def send_vam_offline_alert(base_url: str, error: str) -> None:
    send_platform_alert(
        kind="vam_offline",
        subject="VAM engine offline",
        what_happened=(
            f"The VAM engine at {base_url} did not respond to a health probe. "
            "Ravi's backtests will fail until this is fixed."
        ),
        likely_cause=error,
        what_to_do=(
            "1. SSH the VPS.\n"
            "2. sudo docker ps | grep vam-engine (is it running?).\n"
            "3. sudo docker logs --tail 100 ifa-vam-engine.\n"
            "4. If stopped: sudo docker start ifa-vam-engine.\n"
            "5. If crash-looping: check its logs for the exception."
        ),
        context={"VAM base URL": base_url, "Error": error},
        severity="critical",
        dedupe_key="vam_offline",
    )


def send_storage_alert(operation: str, storage_key: str, error: str) -> None:
    send_platform_alert(
        kind="storage_error",
        subject=f"Storage {operation} failed",
        what_happened=(
            f"A storage {operation} on key `{storage_key}` failed. "
            "Depending on which flow triggered it, a backtest result may be lost or a client may hit an error."
        ),
        likely_cause=error,
        what_to_do=(
            "1. Check Supabase project status: https://supabase.com/dashboard\n"
            "2. Verify STORAGE_BACKEND env variable.\n"
            "3. Check backend logs for storage errors."
        ),
        context={"Operation": operation, "Key": storage_key, "Error": error},
        severity="critical",
        dedupe_key=f"storage::{operation}",
    )


def send_health_alert(
    metric: str,
    value: str,
    threshold: str,
    hint: str = "",
) -> None:
    """Emitted by the VPS-side health cron for disk / RAM / cert / renewal thresholds."""
    send_platform_alert(
        kind=metric,
        subject=f"Threshold breach: {metric} = {value}",
        what_happened=f"The health cron detected {metric} = {value} (threshold: {threshold}).",
        likely_cause=hint or "See the value above.",
        what_to_do=(
            "Investigate before this becomes a customer-visible issue.\n"
            "For disk: du -sh /var/lib/docker /opt/ifa-backtest-product /var/log/*\n"
            "For RAM: check top / free -h\n"
            "For renewal: log in to OVH or Hostinger and renew NOW."
        ),
        context={"Metric": metric, "Current": value, "Threshold": threshold},
        severity="warning",
        dedupe_key=metric,
    )


# ── Body rendering ──────────────────────────────────────────────────────────

def _render(
    kind: str,
    subject: str,
    what_happened: str,
    likely_cause: str,
    what_to_do: str,
    context: dict[str, Any],
    style: dict[str, str],
) -> tuple[str, str]:
    """Produce (plain-text, html) versions of the alert body."""
    ts = _now_iso()

    text_lines = [
        f"[{style['label']}] IFA Portal - {subject}",
        f"When: {ts}",
        f"Kind: {kind}",
        "",
        "WHAT HAPPENED",
        what_happened,
        "",
    ]
    if likely_cause:
        text_lines += ["LIKELY CAUSE", likely_cause, ""]
    if what_to_do:
        text_lines += ["WHAT TO DO", what_to_do, ""]
    if context:
        text_lines.append("CONTEXT")
        for k, v in context.items():
            text_lines.append(f"  {k}: {v}")
    text_body = "\n".join(text_lines)

    def _esc(s: str) -> str:
        return (
            str(s)
            .replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        )

    ctx_html = ""
    if context:
        rows = "".join(
            f"<tr><td style='padding:4px 12px 4px 0;color:#64748b;white-space:nowrap;vertical-align:top;font-weight:500'>{_esc(k)}</td>"
            f"<td style='padding:4px 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;white-space:pre-wrap;word-break:break-word'>{_esc(v)}</td></tr>"
            for k, v in context.items()
        )
        ctx_html = (
            f"<h3 style='color:#0f172a;font-size:13px;margin:20px 0 6px 0'>CONTEXT</h3>"
            f"<table style='border-collapse:collapse;font-size:12px;width:100%'>{rows}</table>"
        )

    cause_html = (
        f"<h3 style='color:#0f172a;font-size:13px;margin:20px 0 6px 0'>LIKELY CAUSE</h3>"
        f"<div style='color:#334155'>{_esc(likely_cause)}</div>"
    ) if likely_cause else ""

    todo_html = (
        f"<h3 style='color:#0f172a;font-size:13px;margin:20px 0 6px 0'>WHAT TO DO</h3>"
        f"<pre style='background:#f1f5f9;padding:12px;border-radius:6px;color:#0f172a;"
        f"white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;margin:0'>"
        f"{_esc(what_to_do)}</pre>"
    ) if what_to_do else ""

    html_body = f"""\
<div style='font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
            color:#0f172a;line-height:1.55;max-width:640px;margin:0 auto;
            padding:32px 24px;background:#ffffff'>
  <div style='display:inline-block;padding:4px 10px;border-radius:999px;
              background:{style['color']}20;color:{style['color']};
              font-size:11px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase;
              margin-bottom:12px'>
    {style['emoji']} {style['label']}
  </div>
  <h2 style='color:#0f172a;font-size:18px;margin:0 0 4px 0'>IFA Portal - {_esc(subject)}</h2>
  <div style='color:#64748b;font-size:12px;margin-bottom:20px'>{_esc(ts)} - kind: {_esc(kind)}</div>

  <h3 style='color:#0f172a;font-size:13px;margin:20px 0 6px 0'>WHAT HAPPENED</h3>
  <div style='color:#334155'>{_esc(what_happened)}</div>

  {cause_html}
  {todo_html}
  {ctx_html}

  <div style='margin-top:32px;padding-top:16px;border-top:1px solid #e2e8f0;
              color:#94a3b8;font-size:11px'>
    Sent by the IFA Portal alerter to
    dhumalajinkya2004@gmail.com + insightfusionanalytics@gmail.com.
    Reply to this thread with fixes for the audit trail.
  </div>
</div>
"""
    return text_body, html_body
