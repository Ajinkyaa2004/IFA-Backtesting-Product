"""self-serve signup + admin approval flow

Adds signup_status + audit columns to users so clients can create their own
Firebase account, land in a pending queue, and unlock the dashboard only
after an admin approves them from /admin/signups.

signup_status is separate from user.status:
  - user.status ('active' | 'suspended') covers ongoing account state
  - signup_status ('pending_approval' | 'approved' | 'rejected') covers the
    one-time onboarding gate

Existing rows are backfilled to 'approved' so admins and existing clients
(Sterling, Ravi) keep working without a re-approval step.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "e88h55432001"
down_revision: Union[str, None] = "d77h54322001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "signup_status",
            sa.String(length=30),
            nullable=False,
            server_default="approved",
        ),
    )
    op.add_column(
        "users",
        sa.Column(
            "signup_metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )
    op.add_column(
        "users",
        sa.Column("signup_requested_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("signup_approved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("signup_approved_by", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "users",
        sa.Column("signup_rejection_reason", sa.Text(), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_signup_approved_by_users",
        "users",
        "users",
        ["signup_approved_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "signup_status_valid",
        "users",
        "signup_status IN ('pending_approval','approved','rejected')",
    )
    # Backfill: existing users get signup_approved_at = created_at so audit
    # queries treating approved_at as the true onboarding time still work.
    op.execute(
        """
        UPDATE users
           SET signup_approved_at = created_at
         WHERE signup_status = 'approved'
           AND signup_approved_at IS NULL
        """
    )


def downgrade() -> None:
    op.drop_constraint("signup_status_valid", "users", type_="check")
    op.drop_constraint("fk_users_signup_approved_by_users", "users", type_="foreignkey")
    op.drop_column("users", "signup_rejection_reason")
    op.drop_column("users", "signup_approved_by")
    op.drop_column("users", "signup_approved_at")
    op.drop_column("users", "signup_requested_at")
    op.drop_column("users", "signup_metadata")
    op.drop_column("users", "signup_status")
