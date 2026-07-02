"""engines registry (Chirag Item #3) + isolation gate columns (Item #6)

Revision ID: b55f32100001
Revises: a44e21f00001
Create Date: 2026-07-01 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'b55f32100001'
down_revision: Union[str, None] = 'a44e21f00001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create engines + add FK from engagements.engine_id → engines.id.

    Backfill:
      * ENG-VAM-001 seeded as the canonical VAM engine (family='vam',
        status='live', isolation_passed_at=now() — implicitly passed
        because it's been serving Ravi in production).
      * param_schema populated with a placeholder that says
        {'source': 'runtime'} — actual VAM schema is served at runtime
        by the VAM upstream. Item #4 replaces with a real schema.
      * Any existing engagement whose client is Ravi's (vam_enabled=true)
        has engine_assignment flipped to 'existing' and engine_id pointed
        at ENG-VAM-001. Nobody else touched.
    """
    op.create_table(
        "engines",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("code", sa.String(length=64), nullable=False, unique=True),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("owner_email", sa.String(length=320), nullable=False),
        sa.Column("strategy_family", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default=sa.text("'dev'")),
        sa.Column("covers", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column(
            "param_schema",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("isolation_passed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("isolation_notes", sa.Text(), nullable=False, server_default=sa.text("''")),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "status IN ('dev','isolation_pending','live','retired')",
            name="ck_engines_status_valid",
        ),
    )

    # Add the real FK from engagements to engines. The column was created
    # in the earlier engagement migration WITHOUT a FK constraint (deferred);
    # add it now that engines exists.
    op.create_foreign_key(
        "fk_engagements_engine_id_engines",
        "engagements",
        "engines",
        ["engine_id"],
        ["id"],
        ondelete="SET NULL",
    )

    # Backfill VAM engine
    op.execute(
        """
        INSERT INTO engines (
            code, name, owner_email, strategy_family, status,
            covers, param_schema, isolation_passed_at, isolation_notes
        ) VALUES (
            'ENG-VAM-001',
            'VAM — Volatility Adjusted Momentum',
            'ravi@ifa.com',
            'vam',
            'live',
            'RSI + VIX kill-switch on SPY with UPRO and SVIX sleeves. Live since 2026-Q2.',
            '{"source": "runtime", "family": "vam", "note": "Schema served by VAM upstream at /api/strategies/{step_id}/schema"}'::jsonb,
            now(),
            'Grandfathered as live per production track record. Isolation harness lands with Item #6.'
        );
        """
    )

    # Point every vam_enabled client's engagement at this engine.
    op.execute(
        """
        UPDATE engagements
        SET
            engine_assignment = 'existing',
            engine_id = (SELECT id FROM engines WHERE code = 'ENG-VAM-001')
        WHERE client_id IN (SELECT id FROM clients WHERE vam_enabled = true)
        """
    )


def downgrade() -> None:
    # Un-point engagements before dropping engines
    op.execute("UPDATE engagements SET engine_id = NULL, engine_assignment = 'manual' WHERE engine_id IS NOT NULL")
    op.drop_constraint("fk_engagements_engine_id_engines", "engagements", type_="foreignkey")
    op.drop_table("engines")
