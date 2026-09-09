"""backtests.is_demo — flag demo backtests so clients don't confuse them
with real deliverables

Every client approved via the self-serve signup flow now gets one canned
demo backtest pre-loaded. Without a flag, that demo would be visually
indistinguishable from a real result and could easily be mistaken for
the client's own work. The `is_demo` column lets the UI badge these
rows clearly and, if we ever want to hide them once real work lands,
filter on it.

Existing seed backtests (BT-2026-0001, -0006, -0007, -0008 on the
Sterling demo client) are backfilled to is_demo=TRUE so the Sterling
account also shows the DEMO badge — those rows were always demo data.
Every other historical row remains is_demo=FALSE.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "f99i66543001"
down_revision: Union[str, None] = "e88h55432001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


SEED_DEMO_CODES = (
    "BT-2026-0001",
    "BT-2026-0006",
    "BT-2026-0007",
    "BT-2026-0008",
)


def upgrade() -> None:
    op.add_column(
        "backtests",
        sa.Column(
            "is_demo",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
    )
    op.execute(
        f"""
        UPDATE backtests
           SET is_demo = TRUE
         WHERE code IN {SEED_DEMO_CODES!r}
        """
    )


def downgrade() -> None:
    op.drop_column("backtests", "is_demo")
