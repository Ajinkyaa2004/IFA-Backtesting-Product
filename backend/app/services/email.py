"""Transactional email — Gmail SMTP.

Three templates for the signup + approval flow:
  send_admin_signup_notification  — pings insightfusionanalytics@gmail.com when a
                                    new signup lands in the queue
  send_client_approval_email      — tells the client they're approved
  send_client_rejection_email     — tells the client they were rejected + reason

Design:
  - All calls are safe to fire from BackgroundTasks — they catch every
    exception and log it. Never let a signup fail because the SMTP handshake
    is slow or Gmail is briefly throttling.
  - When SMTP_HOST is unset (local dev) every helper no-ops with a warning.
    This keeps `POST /auth/signup` working on a laptop without leaking real
    emails to Gmail while developing.
  - HTML + plain text alternatives so email clients pick the best one.
"""

from __future__ import annotations

import smtplib
import ssl
from email.message import EmailMessage
from email.utils import formataddr
from typing import Any

from loguru import logger

from app.core.config import get_settings


def _send(to: str, subject: str, text_body: str, html_body: str) -> bool:
    """Blocking SMTP send. Returns True on success, False on any failure.

    Failures NEVER raise — the caller is a signup or approval action that
    must succeed even if the email queue is unreachable. Ops sees the log.
    """
    settings = get_settings()
    if not settings.email_configured:
        logger.warning(
            "Email skipped (SMTP not configured): to={} subject={!r}",
            to, subject,
        )
        return False

    msg = EmailMessage()
    from_addr = settings.SMTP_FROM or settings.SMTP_USER
    msg["From"] = formataddr((settings.SMTP_FROM_NAME, from_addr))
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text_body)
    msg.add_alternative(html_body, subtype="html")

    try:
        with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls(context=ssl.create_default_context())
            server.ehlo()
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
            server.send_message(msg)
        logger.info("Email sent: to={} subject={!r}", to, subject)
        return True
    except Exception as e:
        logger.exception(
            "Email FAILED: to={} subject={!r} err={}",
            to, subject, e,
        )
        return False


# ── Styling primitives (inline CSS because most mail clients strip <style>) ─
_BASE_STYLE = """
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #0f172a; line-height: 1.55; max-width: 560px; margin: 0 auto;
  padding: 32px 24px; background: #ffffff;
""".strip()

_HEADER = """
<div style="border-bottom: 3px solid #0ea5e9; padding-bottom: 12px; margin-bottom: 24px;">
  <div style="font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase;
              color: #64748b; font-weight: 600;">IFA Backtest Engine</div>
  <div style="font-size: 18px; font-weight: 600; margin-top: 4px;">
    Insight Fusion Analytics
  </div>
</div>
""".strip()

_FOOTER = """
<hr style="border: none; border-top: 1px solid #e2e8f0; margin: 32px 0 16px;" />
<div style="font-size: 12px; color: #94a3b8;">
  This message was sent by the IFA Backtest Engine portal.
  If you did not expect this email, you can safely ignore it.
</div>
""".strip()


def _wrap_html(body: str) -> str:
    return f'<div style="{_BASE_STYLE}">{_HEADER}{body}{_FOOTER}</div>'


def _button(url: str, label: str) -> str:
    return (
        f'<a href="{url}" style="display: inline-block; background: #0ea5e9; '
        f"color: #ffffff; padding: 12px 24px; border-radius: 8px; "
        f'text-decoration: none; font-weight: 600; font-size: 14px;">{label}</a>'
    )


# ── Public helpers ─────────────────────────────────────────────────────────

def send_admin_signup_notification(
    *,
    name: str,
    email: str,
    company: str | None,
    phone: str | None,
    purpose: str | None,
    admin_url: str,
) -> bool:
    """Notify the main admin that a new signup needs approval."""
    settings = get_settings()
    to = settings.ADMIN_NOTIFY_EMAIL or settings.SMTP_USER
    if not to:
        logger.warning("Admin signup notification skipped — no ADMIN_NOTIFY_EMAIL")
        return False

    subject = f"New signup request — {name} ({email})"

    text = (
        f"A new client has requested access to the IFA Backtest Engine portal.\n\n"
        f"Name: {name}\n"
        f"Email: {email}\n"
        f"Company: {company or '—'}\n"
        f"Phone: {phone or '—'}\n"
        f"Purpose: {purpose or '—'}\n\n"
        f"Review and approve at: {admin_url}\n"
    )

    rows = "".join(
        f'<tr><td style="padding: 6px 12px 6px 0; color: #64748b; font-size: 13px;">'
        f'{k}</td><td style="padding: 6px 0; font-weight: 500;">{v or "—"}</td></tr>'
        for k, v in [
            ("Name", name),
            ("Email", email),
            ("Company", company),
            ("Phone", phone),
            ("Purpose", purpose),
        ]
    )
    html = _wrap_html(
        f'<h2 style="font-size: 20px; margin: 0 0 12px;">New signup request</h2>'
        f'<p style="color: #475569; margin: 0 0 20px;">'
        f'Someone just requested access to the portal. Review their details '
        f'and approve or reject them from the admin console.</p>'
        f'<table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">'
        f'{rows}</table>'
        f'{_button(admin_url, "Review in admin console")}'
    )
    return _send(to, subject, text, html)


def send_client_approval_email(
    *,
    to_email: str,
    name: str,
    login_url: str,
) -> bool:
    """Tell the client their account is approved and ready to use."""
    subject = "Your IFA Backtest Engine account is approved"

    text = (
        f"Hi {name},\n\n"
        f"Good news — your IFA Backtest Engine account has been approved. "
        f"You can now sign in with the same credentials you used to register.\n\n"
        f"Sign in: {login_url}\n\n"
        f"On your first sign-in you'll be asked to accept the terms of "
        f"engagement, then you'll land on your personalized dashboard.\n\n"
        f"— The IFA team"
    )

    html = _wrap_html(
        f'<h2 style="font-size: 20px; margin: 0 0 12px;">You\'re in.</h2>'
        f'<p style="margin: 0 0 12px;">Hi {name},</p>'
        f'<p style="color: #475569; margin: 0 0 20px;">'
        f'Good news — your IFA Backtest Engine account has been approved. '
        f'Sign in with the same credentials you used to register.</p>'
        f'{_button(login_url, "Sign in to your dashboard")}'
        f'<p style="color: #64748b; font-size: 13px; margin-top: 24px;">'
        f'On your first sign-in you\'ll be asked to accept the terms of '
        f'engagement, then you\'ll land on your personalized dashboard.</p>'
    )
    return _send(to_email, subject, text, html)


def send_client_rejection_email(
    *,
    to_email: str,
    name: str,
    reason: str,
) -> bool:
    """Tell the client their signup was not approved, with the reason."""
    subject = "Update on your IFA Backtest Engine signup"

    text = (
        f"Hi {name},\n\n"
        f"Thanks for your interest in the IFA Backtest Engine. After reviewing "
        f"your request, we're not able to approve access at this time.\n\n"
        f"Reason: {reason}\n\n"
        f"If you'd like to discuss this or provide more context, please "
        f"reply to this email and we'll get back to you.\n\n"
        f"— The IFA team"
    )

    html = _wrap_html(
        f'<h2 style="font-size: 20px; margin: 0 0 12px;">About your signup</h2>'
        f'<p style="margin: 0 0 12px;">Hi {name},</p>'
        f'<p style="color: #475569; margin: 0 0 16px;">'
        f'Thanks for your interest in the IFA Backtest Engine. After reviewing '
        f'your request, we\'re not able to approve access at this time.</p>'
        f'<div style="background: #fef2f2; border-left: 3px solid #ef4444; '
        f'padding: 12px 16px; margin: 16px 0; border-radius: 4px;">'
        f'<div style="font-size: 12px; color: #991b1b; font-weight: 600; '
        f'text-transform: uppercase; letter-spacing: 0.05em;">Reason</div>'
        f'<div style="margin-top: 4px;">{reason}</div>'
        f'</div>'
        f'<p style="color: #64748b; font-size: 13px;">'
        f'If you\'d like to discuss this or share more context, just reply to '
        f'this email and we\'ll get back to you.</p>'
    )
    return _send(to_email, subject, text, html)
