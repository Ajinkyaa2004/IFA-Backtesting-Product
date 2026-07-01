"""content_setting table for admin-editable UI copy

Revision ID: e91c33210001
Revises: 7fc4d1e68eea
Create Date: 2026-07-01 20:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'e91c33210001'
down_revision: Union[str, None] = '7fc4d1e68eea'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Every editable client-visible content block gets one row here.

    key    — logical name ('welcome', 'tier_card', 'onboarding', 'placeholder_tiles',
             'support_footer', 'announcement', 'sections'). One row per group so
             admins can PATCH one category at a time without racing others.
    value  — JSONB payload. Shape validated by the service layer, not the DB,
             so we don't need a migration every time we add a field.
    """
    op.create_table(
        "content_settings",
        sa.Column("key", sa.String(length=64), primary_key=True),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("updated_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_table("content_settings")
