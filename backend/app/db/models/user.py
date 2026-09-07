import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin


class User(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "users"

    firebase_uid: Mapped[str] = mapped_column(String(128), nullable=False)
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")

    client_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE")
    )

    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Per-user gate for scope re-acknowledgement — bumped when this user has
    # accepted the current engagement scope_version. Compared against
    # Engagement.scope_version on every /me call to decide whether to show
    # the re-ack banner. Nullable so existing users default to "hasn't seen"
    # and are prompted to re-ack once.
    acked_scope_version: Mapped[int | None] = mapped_column(nullable=True)

    # Self-serve signup + admin approval flow. Separate from `status` because
    # the two mean different things:
    #   status         = 'active' | 'suspended' (whole-account state)
    #   signup_status  = 'pending_approval' | 'approved' | 'rejected'
    #                    (one-time onboarding gate, admin-controlled)
    # A user can only reach the dashboard when both status='active' AND
    # signup_status='approved'. Rejected users see the rejection reason.
    signup_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="approved", server_default="approved"
    )
    signup_metadata: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    signup_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    signup_approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    signup_approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    signup_rejection_reason: Mapped[str | None] = mapped_column(Text)

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    __table_args__ = (
        UniqueConstraint("firebase_uid", name="users_firebase_uid_key"),
        UniqueConstraint("email", name="users_email_key"),
        CheckConstraint("role IN ('client','sub_admin','main_admin')", name="role_valid"),
        CheckConstraint("status IN ('active','suspended')", name="user_status_valid"),
        CheckConstraint(
            "signup_status IN ('pending_approval','approved','rejected')",
            name="signup_status_valid",
        ),
    )
