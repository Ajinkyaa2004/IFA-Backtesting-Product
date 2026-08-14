"""services catalog + quotes + engagement.service_id FK (meeting 2026-07-09)

Three coupled changes shipped together because the Service is the parent
of both Engagement and Quote:

  1. `services` table — catalog of what IFA offers (backtesting, crypto
     ops, sports predictions, video editing, custom). Each carries its
     own `lifecycle_template` JSONB that the LifecycleStepper reads.

  2. `engagements.service_id` FK — every engagement now belongs to a
     service. Backfill: every existing engagement (all currently
     backtest-only) points at the seeded 'backtesting' service.

  3. `quotes` table — per-request pricing. Admin composes, client
     accepts / rejects. Payment happens on Upwork; the quote is the
     mechanism to formally accept scope + amount inside the portal.

Revision ID: d77h54322001
Revises: c66g43211001
Create Date: 2026-07-09 21:30:00.000000
"""
from typing import Sequence, Union
import json
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "d77h54322001"
down_revision: Union[str, None] = "c66g43211001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Lifecycle templates for each seeded service. Kept here (not in the
# service module) because the migration is the source of truth for
# initial data — later admin edits mutate the JSON in-place.
LIFECYCLE_BACKTESTING = [
    {"key": "setup",            "label": "Set up",            "description": "Account provisioned"},
    {"key": "terms_signed",     "label": "Terms signed",      "description": "T&Cs accepted"},
    {"key": "strategy_received", "label": "Strategy received", "description": "Upload + engineer confirms"},
    {"key": "engine_ready",     "label": "Engine ready",      "description": "Live"},
    {"key": "first_backtest",   "label": "First backtest",    "description": "Delivered"},
    {"key": "tuning_unlocked",  "label": "Tuning unlocked",   "description": "Parameter controls active"},
]

LIFECYCLE_CRYPTO_OPS = [
    {"key": "setup",         "label": "Set up",         "description": "Account provisioned"},
    {"key": "terms_signed",  "label": "Terms signed",   "description": "T&Cs accepted"},
    {"key": "keys_received", "label": "API keys shared", "description": "Binance keys received"},
    {"key": "bot_built",     "label": "Bot built",      "description": "Trading logic implemented"},
    {"key": "live",          "label": "Live",           "description": "Running on your account"},
]

LIFECYCLE_SPORTS = [
    {"key": "setup",         "label": "Set up",         "description": "Account provisioned"},
    {"key": "terms_signed",  "label": "Terms signed",   "description": "T&Cs accepted"},
    {"key": "brief_shared",  "label": "Brief shared",   "description": "Model requirements confirmed"},
    {"key": "model_ready",   "label": "Model ready",    "description": "Predictions engine tested"},
    {"key": "delivering",    "label": "Delivering",     "description": "Daily picks flowing"},
]

LIFECYCLE_VIDEO = [
    {"key": "setup",         "label": "Set up",         "description": "Account provisioned"},
    {"key": "terms_signed",  "label": "Terms signed",   "description": "T&Cs accepted"},
    {"key": "footage_recv",  "label": "Footage received", "description": "Raw files uploaded"},
    {"key": "first_cut",     "label": "First cut",      "description": "Draft delivered"},
    {"key": "final",         "label": "Final",          "description": "Signed off"},
]

LIFECYCLE_CUSTOM = [
    {"key": "setup",         "label": "Set up",         "description": "Account provisioned"},
    {"key": "terms_signed",  "label": "Terms signed",   "description": "T&Cs accepted"},
    {"key": "scope_agreed",  "label": "Scope agreed",   "description": "Quote accepted"},
    {"key": "in_progress",   "label": "In progress",    "description": "Engineering underway"},
    {"key": "delivered",     "label": "Delivered",      "description": "Handoff complete"},
]

SEED_SERVICES = [
    {"code": "backtesting",       "name": "Systematic Backtesting",    "tagline": "Test your strategy on historical data with honest reports",       "icon": "📊", "sort_order": 10, "template": LIFECYCLE_BACKTESTING},
    {"code": "crypto_ops",        "name": "Crypto / Binance Ops",      "tagline": "Automated trading bots on your Binance / crypto exchange account", "icon": "🪙", "sort_order": 20, "template": LIFECYCLE_CRYPTO_OPS},
    {"code": "sports_predictions", "name": "Sports Predictions",       "tagline": "Data-driven predictions for sports betting or fantasy",           "icon": "🎯", "sort_order": 30, "template": LIFECYCLE_SPORTS},
    {"code": "video_editing",     "name": "Video Editing",             "tagline": "Post-production for content creators and brands",                  "icon": "🎬", "sort_order": 40, "template": LIFECYCLE_VIDEO},
    {"code": "custom",            "name": "Custom Development",        "tagline": "Bespoke technical work outside our standard catalog",              "icon": "🛠️", "sort_order": 90, "template": LIFECYCLE_CUSTOM},
]


def upgrade() -> None:
    # 1. services table
    op.create_table(
        "services",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String(32), nullable=False, unique=True),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("tagline", sa.String(255)),
        sa.Column("description", sa.Text()),
        sa.Column("icon", sa.String(32)),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lifecycle_template", postgresql.JSONB(astext_type=sa.Text())),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )

    # Seed the 5 services
    bind = op.get_bind()
    for s in SEED_SERVICES:
        bind.execute(
            sa.text("""
                INSERT INTO services (code, name, tagline, icon, sort_order, lifecycle_template)
                VALUES (:code, :name, :tagline, :icon, :sort_order, CAST(:tpl AS jsonb))
            """),
            {
                "code": s["code"],
                "name": s["name"],
                "tagline": s["tagline"],
                "icon": s["icon"],
                "sort_order": s["sort_order"],
                "tpl": json.dumps(s["template"]),
            },
        )

    # 2. engagement.service_id FK — nullable so backfill works
    op.add_column(
        "engagements",
        sa.Column("service_id", postgresql.UUID(as_uuid=True)),
    )
    op.create_foreign_key(
        "engagements_service_id_fkey",
        "engagements", "services",
        ["service_id"], ["id"],
        ondelete="SET NULL",
    )
    # Backfill every existing engagement → 'backtesting' service.
    # Every engagement to date was created before the multi-service world,
    # so backtesting is the correct default.
    bind.execute(sa.text("""
        UPDATE engagements
        SET service_id = (SELECT id FROM services WHERE code = 'backtesting')
        WHERE service_id IS NULL
    """))

    # 3. quotes table
    op.create_table(
        "quotes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("code", sa.String(32), nullable=False, unique=True),
        sa.Column("client_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("clients.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("service_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("services.id", ondelete="SET NULL")),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("amount_inr", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False, server_default="INR"),
        sa.Column("status", sa.String(20), nullable=False, server_default="draft"),
        sa.Column("valid_until", sa.DateTime(timezone=True)),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("accepted_at", sa.DateTime(timezone=True)),
        sa.Column("rejected_at", sa.DateTime(timezone=True)),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("status IN ('draft','sent','accepted','rejected','expired')", name="quote_status_valid"),
        sa.CheckConstraint("amount_inr >= 0", name="quote_amount_nonnegative"),
    )
    op.create_index("ix_quotes_client_status", "quotes", ["client_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_quotes_client_status", table_name="quotes")
    op.drop_table("quotes")
    op.drop_constraint("engagements_service_id_fkey", "engagements", type_="foreignkey")
    op.drop_column("engagements", "service_id")
    op.drop_table("services")
