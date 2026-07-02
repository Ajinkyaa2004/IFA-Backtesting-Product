import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
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

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    deleted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    __table_args__ = (
        UniqueConstraint("firebase_uid", name="users_firebase_uid_key"),
        UniqueConstraint("email", name="users_email_key"),
        CheckConstraint("role IN ('client','sub_admin','main_admin')", name="role_valid"),
        CheckConstraint("status IN ('active','suspended')", name="user_status_valid"),
    )
