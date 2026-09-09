import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Boolean, CheckConstraint, DateTime, ForeignKey, Index, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin


class Backtest(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "backtests"

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("clients.id", ondelete="CASCADE"), nullable=False
    )
    strategy_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("strategy_documents.id", ondelete="SET NULL")
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="draft")
    # Which engine produced this row. Drives the frontend renderer choice:
    #   "manual" → existing v1.0 schema renderer (backtest.schema.json)
    #   "vam"    → VAM-native renderer (backtest.vam.schema.json)
    # Default 'manual' preserves all historical rows.
    engine: Mapped[str] = mapped_column(String(20), nullable=False, default="manual")
    # Canned example row auto-provisioned on signup approval. UI shows a
    # DEMO badge and hides these from tier-usage counting so a client's
    # first real backtest still reads as the first one. Never toggle at
    # runtime — set exactly once at insert time.
    is_demo: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default="false"
    )
    assumptions: Mapped[dict | None] = mapped_column(JSONB)
    metrics: Mapped[dict | None] = mapped_column(JSONB)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint(
            "status IN ('draft','quote_requested','quote_sent','approved','in_progress','completed','revision_requested','cancelled')",
            name="backtest_status_valid",
        ),
        CheckConstraint(
            "engine IN ('manual','vam')",
            name="backtest_engine_valid",
        ),
        Index("ix_backtests_client_status", "client_id", "status"),
    )


class BacktestFile(UUIDPKMixin, TimestampMixin, Base):
    __tablename__ = "backtest_files"

    backtest_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("backtests.id", ondelete="CASCADE"), nullable=False
    )
    file_type: Mapped[str] = mapped_column(String(40), nullable=False)
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    checksum: Mapped[str | None] = mapped_column(String(128))

    __table_args__ = (
        CheckConstraint(
            "file_type IN ('result_json','trade_csv','report_pdf','other')",
            name="backtest_file_type_valid",
        ),
    )
