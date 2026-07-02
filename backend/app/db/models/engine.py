import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin


class Engine(UUIDPKMixin, TimestampMixin, Base):
    """Engine registry (Chirag Item #3). Every bespoke or existing engine
    is a row here. Engagements reference this by engine_id.

    Fields:
      code               human-readable ID like ENG-VAM-001
      name               display name for admin lists
      owner_email        the engineer responsible
      strategy_family    logical family key (ema_cross_rsi, vam, etc.)
      status             dev | isolation_pending | live | retired
      covers             free-form description of scope (Chirag Section 3.2)
      param_schema       JSONB with params, constraints, holdout config
                         (Chirag Section 3.3, Items #4 + #5 consume this)
      isolation_passed_at    NULL until isolation gate passes (Item #6)
      isolation_notes    free-form log of what tests passed

    A row cannot transition to 'live' without isolation_passed_at set —
    enforced by services/engine.transition_status.
    """

    __tablename__ = "engines"

    code: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    owner_email: Mapped[str] = mapped_column(String(320), nullable=False)
    strategy_family: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="dev")
    covers: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # JSONB shape defined in Chirag Section 3.3:
    #   {
    #     "family": "...",
    #     "variants": [...],
    #     "params": { "window_capital": { field: {type, default, min, max} }, ... },
    #     "constraints": ["ema_fast < ema_slow", ...],
    #     "holdout": { "enforced": bool, "reserve_tail_months": int }
    #   }
    # Empty object at creation; admin populates via the schema editor
    # (Item #4) or paste-JSON.
    param_schema: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)

    isolation_passed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    isolation_notes: Mapped[str] = mapped_column(Text, nullable=False, default="")

    __table_args__ = (
        CheckConstraint(
            "status IN ('dev','isolation_pending','live','retired')",
            name="engine_status_valid",
        ),
    )
