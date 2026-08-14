"""engagement whatsapp group link (meeting 2026-07-09)

Delivery + client comms happen on WhatsApp per Anmol's direction. The
portal only stores + surfaces the group link so the client can join it
one-tap from their dashboard.

Revision ID: c66g43211001
Revises: b55f32100001
Create Date: 2026-07-09 21:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c66g43211001"
down_revision: Union[str, None] = "b55f32100001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "engagements",
        sa.Column("whatsapp_group_link", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("engagements", "whatsapp_group_link")
