"""ifa service catalog refresh

Replace the initial catch-all catalogue (backtesting / crypto_ops / sports_predictions
/ video_editing / custom) with IFA's actual five delivery lines:

    1. strategy_audit          - Strategy audit and review
    2. strategy_dev             - Strategy Development and Research
    3. backtest_system          - Backtest system development
    4. backtest_live_system     - Backtest + Live system development
    5. full_stack               - Strategy + backtest + live system development

Everything downstream (Engagements pinned to a service_id, Requests, Quotes) keeps
working because we RENAME the primary `backtesting` row into `backtest_system` in
place (same id) and DEACTIVATE the rest instead of deleting them. That preserves
foreign-key integrity for any prior engagement/quote rows.

New services get proper lifecycle_template entries so LifecycleStepper knows what
progression to render for each engagement type.

Revision ID: g11j77654001
Revises: f99i66543001
Create Date: 2026-09-10 20:20:00
"""
from typing import Sequence, Union

import json
from alembic import op


# revision identifiers, used by Alembic.
revision: str = "g11j77654001"
down_revision: Union[str, None] = "f99i66543001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# ── The 5 services IFA actually delivers ──────────────────────────────────────
# Each service has its own lifecycle_template driving LifecycleStepper. Steps
# match how each engagement type actually flows through the studio.

STRATEGY_AUDIT_LIFECYCLE = [
    {"key": "setup",             "label": "Set up",              "description": "Engagement created"},
    {"key": "terms_signed",      "label": "Terms signed",         "description": "Client accepts T&C"},
    {"key": "strategy_received", "label": "Strategy received",   "description": "Client shares the strategy for audit"},
    {"key": "audit_delivered",   "label": "Audit report delivered", "description": "Review + recommendations sent to client"},
]

STRATEGY_DEV_LIFECYCLE = [
    {"key": "setup",             "label": "Set up",              "description": "Engagement created"},
    {"key": "terms_signed",      "label": "Terms signed",         "description": "Client accepts T&C"},
    {"key": "scope_confirmed",   "label": "Scope confirmed",     "description": "Research goals agreed with client"},
    {"key": "research_delivered", "label": "Research delivered", "description": "Rulebook + backtest handover"},
]

BACKTEST_SYSTEM_LIFECYCLE = [
    {"key": "setup",             "label": "Set up",              "description": "Engagement created"},
    {"key": "terms_signed",      "label": "Terms signed",         "description": "Client accepts T&C"},
    {"key": "strategy_received", "label": "Strategy received",   "description": "Strategy doc uploaded and confirmed"},
    {"key": "engine_ready",      "label": "Engine ready",         "description": "Backtest engine built + isolation-passed"},
    {"key": "first_backtest",    "label": "First backtest",      "description": "First run delivered on the portal"},
    {"key": "tuning_unlocked",   "label": "Tuning unlocked",     "description": "Self-serve parameter tuning available"},
]

BACKTEST_LIVE_LIFECYCLE = [
    {"key": "setup",             "label": "Set up",              "description": "Engagement created"},
    {"key": "terms_signed",      "label": "Terms signed",         "description": "Client accepts T&C"},
    {"key": "strategy_received", "label": "Strategy received",   "description": "Strategy doc uploaded and confirmed"},
    {"key": "engine_ready",      "label": "Engine ready",         "description": "Backtest engine built + isolation-passed"},
    {"key": "first_backtest",    "label": "First backtest",      "description": "First run delivered on the portal"},
    {"key": "live_deployed",     "label": "Live deployed",       "description": "Broker routing enabled + monitored"},
]

FULL_STACK_LIFECYCLE = [
    {"key": "setup",              "label": "Set up",              "description": "Engagement created"},
    {"key": "terms_signed",       "label": "Terms signed",         "description": "Client accepts T&C"},
    {"key": "research_delivered", "label": "Research delivered",  "description": "Rulebook + backtest handover"},
    {"key": "engine_ready",       "label": "Engine ready",         "description": "Backtest engine built + isolation-passed"},
    {"key": "first_backtest",     "label": "First backtest",      "description": "First run delivered on the portal"},
    {"key": "live_deployed",      "label": "Live deployed",       "description": "Broker routing enabled + monitored"},
]


def upgrade() -> None:
    # 1. Rename the primary `backtesting` row into `backtest_system` in-place
    #    so any existing engagements/quotes tied to that service_id keep working.
    op.execute(f"""
        UPDATE services
        SET
            code           = 'backtest_system',
            name           = 'Backtest system development',
            tagline        = 'End-to-end build: strategy → engine → backtest → tuning UI',
            icon           = 'LineChart',
            sort_order     = 30,
            is_active      = TRUE,
            lifecycle_template = '{json.dumps(BACKTEST_SYSTEM_LIFECYCLE)}'::jsonb
        WHERE code = 'backtesting';
    """)

    # 2. Deactivate the legacy catch-all rows (crypto / sports / video / custom).
    #    We DON'T delete them - existing engagements pinned to them stay valid.
    op.execute("""
        UPDATE services
        SET is_active = FALSE
        WHERE code IN ('crypto_ops', 'sports_predictions', 'video_editing', 'custom');
    """)

    # 3. Insert the four new services. Skip on conflict so re-running the
    #    migration in a partially-migrated DB is idempotent.
    op.execute(f"""
        INSERT INTO services (code, name, tagline, icon, sort_order, is_active, lifecycle_template)
        VALUES
            (
                'strategy_audit',
                'Strategy audit and review',
                'Independent review of an existing strategy - assumptions, robustness, execution risk',
                'FileSearch',
                10,
                TRUE,
                '{json.dumps(STRATEGY_AUDIT_LIFECYCLE)}'::jsonb
            ),
            (
                'strategy_dev',
                'Strategy Development and Research',
                'Research + rulebook + reference backtest, delivered as a documented strategy',
                'FlaskConical',
                20,
                TRUE,
                '{json.dumps(STRATEGY_DEV_LIFECYCLE)}'::jsonb
            ),
            (
                'backtest_live_system',
                'Backtest + Live system development',
                'Backtest engine plus live-execution wiring to your broker',
                'Zap',
                40,
                TRUE,
                '{json.dumps(BACKTEST_LIVE_LIFECYCLE)}'::jsonb
            ),
            (
                'full_stack',
                'Strategy + backtest + live system development',
                'Full pipeline - research the strategy, build the engine, deploy live',
                'Rocket',
                50,
                TRUE,
                '{json.dumps(FULL_STACK_LIFECYCLE)}'::jsonb
            )
        ON CONFLICT (code) DO NOTHING;
    """)


def downgrade() -> None:
    # Delete the newly inserted rows (any engagement using them would fail FK,
    # so downgrade is only safe on a fresh DB). Reactivate legacy catalog.
    op.execute("""
        DELETE FROM services
        WHERE code IN ('strategy_audit', 'strategy_dev', 'backtest_live_system', 'full_stack');
    """)
    op.execute("""
        UPDATE services
        SET code = 'backtesting', name = 'Systematic Backtesting',
            tagline = 'Test your strategy on historical data with a full report and trade log',
            icon = 'BarChart3', sort_order = 10
        WHERE code = 'backtest_system';
    """)
    op.execute("""
        UPDATE services SET is_active = TRUE
        WHERE code IN ('crypto_ops', 'sports_predictions', 'video_editing', 'custom');
    """)
