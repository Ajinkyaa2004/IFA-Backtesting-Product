"""quotes: currency defaults to USD, restricted to USD / INR

Decision (ANMOL_DECISIONS_MEETING B.2, option "INR + USD"): new quotes are
priced in USD unless the admin picks INR.

Only the column DEFAULT changes. Existing rows keep the currency they were
created with (all INR), so no amount is reinterpreted. A CHECK constraint
restricts the column to the two currencies the app formats correctly; both
have 100 minor units per major unit, which the amount maths relies on.

Downgrade note: it restores the INR default and drops the check, but any quote
created in USD in the meantime keeps its USD currency and the older app code
would render it with a rupee sign. Convert or delete those rows first if you
ever roll back.

Revision ID: h22l99876001
Revises: g11k88765001
"""

from typing import Sequence, Union

from alembic import op


revision: str = "h22l99876001"
down_revision: Union[str, None] = "g11k88765001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("quotes", "currency", server_default="USD")
    op.create_check_constraint("quote_currency_valid", "quotes", "currency IN ('USD','INR')")


def downgrade() -> None:
    op.drop_constraint("quote_currency_valid", "quotes", type_="check")
    op.alter_column("quotes", "currency", server_default="INR")
