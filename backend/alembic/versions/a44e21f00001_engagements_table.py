"""engagements table (Chirag Item #1) + users.acked_scope_version

Revision ID: a44e21f00001
Revises: e91c33210001
Create Date: 2026-07-01 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'a44e21f00001'
down_revision: Union[str, None] = 'e91c33210001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create engagements + add users.acked_scope_version + backfill.

    Backfill strategy:
      * One engagement per existing (non-deleted) client
      * status mirrors Client.status but 'active' clients whose latest T&C
        acceptance is missing get 'pending' instead — matches Chirag's spec
        (Section 4) that pending means 'login exists but T&C not accepted'
      * tier mirrors Client.tier
      * scope_in defaults to a single sensible placeholder so the panel
        renders SOMETHING while admins fill in real scope
      * engine_assignment = 'manual' for everyone — safe default
        (Ravi's engagement will be flipped to 'existing' with engine_id
        pointed at the future ENG-VAM-001 row in Chirag Item #3)
      * accepted_tnc_version_id = client.current_tnc_version_id if set
      * scope_version starts at 1, acked_scope_version on users starts at 1
        (so nobody sees a stale re-ack prompt on migration)
    """
    op.create_table(
        "engagements",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("code", sa.String(length=32), nullable=False, unique=True),
        sa.Column(
            "client_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("clients.id", ondelete="CASCADE"),
            nullable=False,
            unique=True,
        ),
        sa.Column("status", sa.String(length=20), nullable=False, server_default=sa.text("'pending'")),
        sa.Column("tier", sa.String(length=20), nullable=False, server_default=sa.text("'tier1'")),
        sa.Column(
            "scope_in",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column(
            "scope_out",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("scope_version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column(
            "engine_assignment",
            sa.String(length=20),
            nullable=False,
            server_default=sa.text("'manual'"),
        ),
        # engine_id FK is added AFTER the engines table lands (Chirag Item #3).
        # For now the column exists but references NULL. When Item #3 ships we
        # add the actual FK constraint in that migration.
        sa.Column("engine_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column(
            "canonical_strategy_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("strategy_documents.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "accepted_tnc_version_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("terms_versions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("deliverable", sa.Text(), nullable=False, server_default=sa.text("''")),
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
            "status IN ('pending','active','suspended','closed')",
            name="ck_engagements_status_valid",
        ),
        sa.CheckConstraint(
            "tier IN ('tier1','tier2','tier3')",
            name="ck_engagements_tier_valid",
        ),
        sa.CheckConstraint(
            "engine_assignment IN ('existing','bespoke','manual')",
            name="ck_engagements_engine_assignment_valid",
        ),
        sa.CheckConstraint(
            "scope_version >= 1",
            name="ck_engagements_scope_version_positive",
        ),
    )

    op.add_column(
        "users",
        sa.Column("acked_scope_version", sa.Integer(), nullable=True),
    )

    # ── Backfill ────────────────────────────────────────────────
    # One engagement row per existing non-deleted client, with a stable
    # code (ENG-YYYY-NNNN based on row_number over created_at).
    op.execute(
        """
        WITH numbered AS (
            SELECT
                c.id,
                c.name,
                c.status,
                c.tier,
                c.current_tnc_version_id,
                c.deleted_at,
                extract(year from now())::int AS y,
                ROW_NUMBER() OVER (ORDER BY c.created_at) AS n
            FROM clients c
            WHERE c.deleted_at IS NULL
        )
        INSERT INTO engagements (
            id, code, client_id, status, tier,
            scope_in, scope_out, scope_version,
            engine_assignment, engine_id, canonical_strategy_id,
            accepted_tnc_version_id, deliverable
        )
        SELECT
            gen_random_uuid(),
            'ENG-' || y::text || '-' || LPAD(n::text, 4, '0'),
            id,
            CASE
                WHEN status = 'suspended' THEN 'suspended'
                WHEN current_tnc_version_id IS NULL THEN 'pending'
                ELSE 'active'
            END,
            tier,
            '["Backtest delivery via the IFA portal"]'::jsonb,
            '[]'::jsonb,
            1,
            'manual',
            NULL,
            NULL,
            current_tnc_version_id,
            'One backtest + tunable rerun once engine reaches live'
        FROM numbered;
        """
    )

    # Set acked_scope_version = 1 for all existing users so nobody sees a
    # stale re-ack prompt after the migration.
    op.execute("UPDATE users SET acked_scope_version = 1 WHERE acked_scope_version IS NULL")


def downgrade() -> None:
    op.drop_column("users", "acked_scope_version")
    op.drop_table("engagements")
