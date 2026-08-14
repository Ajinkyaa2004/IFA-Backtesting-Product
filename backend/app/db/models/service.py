"""Service catalog (meeting 2026-07-09).

The portal used to assume every client onboards to backtesting. Anmol
wants any client — sports predictions, video editing, crypto/Binance
ops, custom dev — to onboard through the same funnel. The Service
catalog is the switch that adapts the client dashboard to what the
client actually bought.

A Service also carries a `lifecycle_template` — the steps shown in the
client's LifecycleStepper. Backtesting has 6 steps (Set up → Terms →
Strategy → Engine → First backtest → Tuning). Crypto ops has a shorter
5-step flow. Every service defines its own.
"""

from __future__ import annotations

from sqlalchemy import Boolean, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin


class Service(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "services"

    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    """Stable identifier used by frontend / seed / audit. e.g. 'backtesting'."""

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    """Display name. e.g. 'Systematic Backtesting'."""

    tagline: Mapped[str | None] = mapped_column(String(255))
    """One-line summary shown on the onboarding service-picker card."""

    description: Mapped[str | None] = mapped_column(Text)
    """Longer paragraph for the picker card + admin overview."""

    icon: Mapped[str | None] = mapped_column(String(32))
    """Emoji or lucide icon name for the picker card."""

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    """Inactive services are hidden from client onboarding but retained
    for historical engagements that still reference them."""

    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    """Ordering on the onboarding picker. Lower = earlier."""

    # Lifecycle steps for this service. Shape: [{key, label, description}]
    # LifecycleStepper reads this instead of hardcoded backtest steps.
    lifecycle_template: Mapped[list[dict] | None] = mapped_column(JSONB)
