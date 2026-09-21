"""audit_live_system service - Strategy audit + Live system development

Adds a 6th active service to the IFA catalog: an audit of an existing strategy
followed by engine build and live deployment. Slots between backtest_live_system
(fresh build + live) and full_stack (research + build + live). The lifecycle
begins with a strategy-audit phase (client already has a strategy) then
transitions into engine build → first backtest → live deploy.

Idempotent: `ON CONFLICT (code) DO NOTHING` so re-running the migration on a
partially-migrated DB is a no-op. No changes to any other row.

Revision ID: j44n11111001
Revises: i33m00000001
Create Date: 2026-09-21 14:30:00
"""
from typing import Sequence, Union

import json
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "j44n11111001"
down_revision: Union[str, None] = "i33m00000001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


AUDIT_LIVE_LIFECYCLE = [
    {"key": "setup",             "label": "Set up",                 "description": "Engagement created"},
    {"key": "terms_signed",      "label": "Terms signed",            "description": "Client accepts T&C"},
    {"key": "strategy_received", "label": "Strategy received",      "description": "Client shares the strategy for audit"},
    {"key": "audit_delivered",   "label": "Audit report delivered", "description": "Review + recommendations sent to client"},
    {"key": "engine_ready",      "label": "Engine ready",            "description": "Backtest engine built + isolation-passed"},
    {"key": "first_backtest",    "label": "First backtest",         "description": "First run delivered on the portal"},
    {"key": "live_deployed",     "label": "Live deployed",          "description": "Broker routing enabled + monitored"},
]


def upgrade() -> None:
    op.execute(f"""
        INSERT INTO services (code, name, tagline, icon, sort_order, is_active, lifecycle_template)
        VALUES (
            'audit_live_system',
            'Strategy audit + Live system development',
            'Audit an existing strategy, then build the engine and deploy it live',
            'Radar',
            45,
            TRUE,
            '{json.dumps(AUDIT_LIVE_LIFECYCLE)}'::jsonb
        )
        ON CONFLICT (code) DO NOTHING;
    """)


def downgrade() -> None:
    # Only safe if no engagement is pinned to this service_id.
    op.execute("DELETE FROM services WHERE code = 'audit_live_system';")
