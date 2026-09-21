"""engagement product_url

Adds a nullable `product_url` column to `engagements`. Admin sets this when a
client has an existing standalone dashboard we want to link out to (e.g. Ravi
has his original Ravi VAM dashboard on Render — we can pin it as an "Open
your product →" card on his Overview without replacing the native VAM UI).

Complements native integration; doesn't replace it. Clients with native
integration AND product_url get both surfaces.

Revision ID: h22k88765001
Revises: g11j77654001
Create Date: 2026-09-10 22:00:00
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "h22k88765001"
down_revision: Union[str, None] = "g11j77654001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "engagements",
        sa.Column("product_url", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("engagements", "product_url")
