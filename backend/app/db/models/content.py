import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ContentSetting(Base):
    """Admin-editable content block. One row per logical category.

    Keys used today: welcome, tier_card, onboarding, placeholder_tiles,
    support_footer, announcement, sections. Adding a new category means
    adding a new default in services/content.DEFAULTS and shipping the
    admin editor UI for it - no migration.
    """

    __tablename__ = "content_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[dict] = mapped_column(JSONB, nullable=False)
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
