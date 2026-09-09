"""Content settings service — source of truth for admin-editable copy.

Everything the client sees that isn't real data (headlines, taglines,
CTA labels, checklist steps, feature bullets, placeholder tile copy,
support-hours block, announcement banner, section visibility) flows
through here. The admin edits from /admin/content; the client reads
from GET /content on every page load.

Defaults are hardcoded below. Admin overrides live in the
content_settings table keyed by category. get_all_content() merges
overrides on top of defaults so a partial DB row (missing new fields
we added later) still renders sensibly.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.db.models import ContentSetting


# Hardcoded fallback content. Every key must exist here or the client
# gets missing strings. When we add a new editable field:
#   1. add it here with a sensible default
#   2. surface it in the admin editor UI
#   3. ship — no migration needed
DEFAULTS: dict[str, dict] = {
    "welcome": {
        "headline": "Welcome to the IFA Backtest Engine",
        "body": "We've preloaded a demo backtest so you can explore the full report view. When you're ready, upload your first strategy document or open a new request.",
        "primary_cta_label": "Open demo report",
        "secondary_cta_label": "Upload strategy",
    },
    "tier_card": {
        "tier1": {
            "tagline": "Perfect for validating one strategy at a time.",
            "features_included": [
                "Client dashboard + strategy library",
                "1 backtest / month (delivered by IFA)",
                "PDF report export",
                "Legal-disclaimer-embedded delivery",
                "Terms & Conditions acceptance flow",
            ],
        },
        "tier2": {
            "tagline": "For teams shipping multiple strategies with self-serve access.",
            "features_included": [
                "Everything in Starter",
                "5 backtests / month",
                "Run VAM engine directly from the portal",
                "Parameter overrides on the engine step picker",
                "Priority email support (24h SLA)",
                "Benchmark comparison against S&P 500 / NIFTY 50 / BTC",
            ],
        },
        "tier3": {
            "tagline": "For firms who need custom research + SLA-backed delivery.",
            "features_included": [
                "Everything in Growth",
                "Unlimited backtests",
                "Custom strategy engineering",
                "Optimisation runs (v2 coming)",
                "Dedicated slack channel + phone support",
                "MSA / DPA / annual audit letters",
            ],
        },
        "upgrade_cta_label": "Talk to us",
    },
    "onboarding": {
        "steps": [
            {"key": "tnc",       "title": "Accept the Terms & Conditions",              "hint_todo": "Read + accept the engagement terms so we can start work.",   "hint_done": "Signed and stored."},
            {"key": "demo",      "title": "Explore the demo backtest",                  "hint_todo": "See the exact report format your strategies will land in.",  "hint_done": "Explored."},
            {"key": "strategy",  "title": "Upload your first strategy document",        "hint_todo": "PDF / DOCX / TXT. Up to 25 MB. Versioned for you.",          "hint_done": "Nice — locked in as source of truth."},
            {"key": "request",   "title": "Open your first request",                    "hint_todo": "New strategy / change request / RFQ / clarification — any of the four.", "hint_done": "In our queue — we'll reach out."},
            {"key": "backtest",  "title": "Review your first delivered backtest",       "hint_todo": "We'll email you when it's ready. Turnaround per your plan's SLA.",  "hint_done": "Read the metrics, export the PDF."},
        ],
    },
    "placeholder_tiles": {
        "ai": {
            "title": "AI Analyst",
            "subtitle": "Ask questions about your backtest in plain English.",
            "badge": "Growth",
        },
        "optimiser": {
            "title": "Parameter optimiser",
            "subtitle": "Automated grid + walk-forward on your strategy.",
            "badge": "Enterprise",
        },
        "billing": {
            "title": "Auto-billing",
            "subtitle": "Manage plan, invoices, and payment methods.",
            "badge": "Soon",
        },
    },
    "support_footer": {
        "hours": "10 AM – 7 PM IST · Mon–Fri",
        "email": "insightfusionanalytics@gmail.com",
        "copyright": "© Insight Fusion Analytics · Backtest Engine v1.0",
    },
    "announcement": {
        "visible": False,
        "kind": "info",          # 'info' | 'warning' | 'success'
        "headline": "",
        "body": "",
        "cta_label": "",
        "cta_url": "",
    },
    "sections": {
        "welcome_banner": True,
        "onboarding_checklist": True,
        "tier_card": True,
        "stat_tiles": True,
        "placeholder_tiles": True,
        "latest_backtests": True,
        "support_footer": True,
        "announcement": True,
    },
}


CATEGORY_KEYS = frozenset(DEFAULTS.keys())


def _deep_merge(base: dict, override: dict) -> dict:
    """Merge override on top of base. Lists are REPLACED (not concatenated)
    because a partial list would be confusing UX. Nested dicts recurse.
    """
    if not isinstance(base, dict) or not isinstance(override, dict):
        return override
    out = dict(base)
    for k, v in override.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = _deep_merge(out[k], v)
        else:
            out[k] = v
    return out


def get_all_content(db: Session) -> dict[str, dict]:
    """Return the current content dict — defaults merged with DB overrides."""
    rows = db.query(ContentSetting).all()
    overrides = {r.key: r.value for r in rows}
    return {
        key: _deep_merge(DEFAULTS[key], overrides.get(key, {}))
        for key in DEFAULTS
    }


def get_content_for_key(db: Session, key: str) -> dict:
    if key not in CATEGORY_KEYS:
        raise ValueError(f"Unknown content key: {key}")
    row = db.query(ContentSetting).filter(ContentSetting.key == key).first()
    override = row.value if row else {}
    return _deep_merge(DEFAULTS[key], override)


def upsert_content(db: Session, key: str, value: dict, updated_by) -> dict:
    """Overwrite the stored value for a category. Value need not be complete —
    get_all_content will fill missing fields from DEFAULTS on read.
    """
    if key not in CATEGORY_KEYS:
        raise ValueError(f"Unknown content key: {key}")
    row = db.query(ContentSetting).filter(ContentSetting.key == key).first()
    if row is None:
        row = ContentSetting(key=key, value=value, updated_by=updated_by)
        db.add(row)
    else:
        row.value = value
        row.updated_by = updated_by
    db.flush()
    return _deep_merge(DEFAULTS[key], row.value)
