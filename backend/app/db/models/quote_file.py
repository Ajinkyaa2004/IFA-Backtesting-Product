"""QuoteFile - the proposal document attached to a quote, with full revision history.

Admin attaches a proposal (PDF / Word / Excel / PowerPoint) to a quote. The
client reads it on their Quotes card. Revisions are append-only: replacing a
proposal never overwrites or deletes what was already sent, so the client
(and audit) can always see exactly what was on the table at each point.

Two kinds of row:

    working copy   revision IS NULL, sent_at IS NULL
                   Uploaded while the quote is still a draft. Internal only -
                   the client never sees it. At most one per quote; uploading
                   again swaps it (it was never sent, so it isn't history).

    revision       revision >= 1, sent_at set
                   What the client actually received. Numbered 1, 2, 3 ... per
                   quote with no gaps. Immutable: no update, no delete.
                   Sending the quote publishes the working copy as the next
                   revision; uploading to an already-sent quote creates one
                   directly and notifies the client.

Once the quote reaches a terminal state (accepted / rejected / expired) the
file set is frozen, so the latest revision is by definition what was accepted.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin


class QuoteFile(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "quote_files"

    quote_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("quotes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    revision: Mapped[int | None] = mapped_column(Integer)
    """1-based, per quote. NULL for the unsent working copy."""

    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    """Sanitised display name, e.g. 'Proposal-EMA-RSI.pdf'."""

    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    """Derived server-side from the extension, never taken from the client."""

    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)

    checksum: Mapped[str] = mapped_column(String(64), nullable=False)
    """SHA-256 hex, computed server-side from the stored bytes."""

    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)

    note: Mapped[str | None] = mapped_column(Text)
    """'What changed' message shown to the client next to this revision."""

    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )

    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    """When the client gained access. NULL for the working copy."""

    __table_args__ = (
        UniqueConstraint("quote_id", "revision", name="quote_file_revision_uniq"),
        # At most one unsent working copy per quote.
        Index(
            "quote_file_one_working_copy",
            "quote_id",
            unique=True,
            postgresql_where=text("revision IS NULL"),
        ),
        CheckConstraint(
            "(revision IS NULL AND sent_at IS NULL) OR (revision IS NOT NULL AND sent_at IS NOT NULL)",
            name="quote_file_published_consistent",
        ),
        CheckConstraint(
            "revision IS NULL OR revision >= 1",
            name="quote_file_revision_positive",
        ),
    )
