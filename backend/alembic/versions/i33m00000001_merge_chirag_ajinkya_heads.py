"""merge chirag and ajinkya migration branches

Both h22k88765001 (product_url column) and h22l99876001 (quote currency
default USD) chain from f99i66543001 via different intermediate migrations,
creating an alembic branch. This merge collapses the two heads into a
single linear history so `alembic upgrade head` picks a single target.

No schema changes here - just the empty-body merge migration that alembic
uses to unify branch heads.

Revision ID: i33m00000001
Revises: h22k88765001, h22l99876001
Create Date: 2026-09-21 13:45:00

"""
from typing import Sequence, Union

# revision identifiers, used by Alembic.
revision: str = "i33m00000001"
down_revision: Union[str, Sequence[str], None] = ("h22k88765001", "h22l99876001")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """No-op merge - the branches carry their own schema changes."""
    pass


def downgrade() -> None:
    """No-op merge downgrade."""
    pass
