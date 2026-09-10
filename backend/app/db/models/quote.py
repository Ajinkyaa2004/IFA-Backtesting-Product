"""Quote - per-request pricing (meeting 2026-07-09).

Anmol's process: discovery call → admin issues a quote in the portal →
client sees the quote in their dashboard → accept / reject. Payment
happens on Upwork (see PaymentDisclaimer); the quote is the mechanism
by which the client formally accepts scope + amount inside our portal.

Status lifecycle:
    draft  → admin composing, not visible to client
    sent   → admin issued; client sees it in their pending quotes card
    accepted / rejected → terminal states
    expired → auto-flipped when valid_until passes without decision

Amount is stored in PAISE (₹ × 100) as an integer to avoid float drift
on money values. Frontend divides by 100 for display.
"""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin


class Quote(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "quotes"

    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    """Human-readable id: QT-YYYY-NNNN. Generated on create."""

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    service_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("services.id", ondelete="SET NULL"),
    )
    """Which service this quote is for. Nullable in case the service
    row is later deleted; we keep the quote for the audit trail."""

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    """Short label. e.g. 'EMA/RSI strategy backtest + 3 tuning rounds'."""

    description: Mapped[str | None] = mapped_column(Text)
    """What the client is buying - scope, deliverables, timeline."""

    amount_inr: Mapped[int] = mapped_column(Integer, nullable=False)
    """Amount in PAISE (₹ × 100). Store as int to avoid float rounding.
    Frontend divides by 100 for display. e.g. 5000000 = ₹50,000."""

    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")

    status: Mapped[str] = mapped_column(String(20), nullable=False, default="draft")
    """draft | sent | accepted | rejected | expired."""

    valid_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    """Optional expiry. When passed, worker flips status to 'expired'."""

    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rejected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    notes: Mapped[str | None] = mapped_column(Text)
    """Admin-only notes for context. Not shown to client."""

    __table_args__ = (
        CheckConstraint(
            "status IN ('draft','sent','accepted','rejected','expired')",
            name="quote_status_valid",
        ),
        CheckConstraint(
            "amount_inr >= 0",
            name="quote_amount_nonnegative",
        ),
    )
