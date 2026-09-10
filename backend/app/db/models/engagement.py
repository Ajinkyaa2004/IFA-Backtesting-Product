import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDPKMixin


class Engagement(UUIDPKMixin, TimestampMixin, Base):
    """The Engagement is the source of truth for a client relationship.

    Per Chirag's spec (Section 3.1), this consolidates what was previously
    scattered across the Client row, T&C version, and implicit scope. Every
    downstream object (backtests, requests, strategy uploads) is contextually
    'against' the current engagement, though the FK on those rows still
    points at client_id - a change of engagement is a change of the same
    client's contract, not a new client.

    Cardinality: one engagement per client. If we ever offer a client
    multiple concurrent contracts (rare - mostly a "sunset the old, start
    a new" flow), we drop the UNIQUE and introduce an active flag.

    Versioning: `scope_version` bumps on any scope edit. The client must
    re-acknowledge on next login (see acked_scope_version on User for
    the per-user gate + admin re-ack endpoint).
    """

    __tablename__ = "engagements"

    code: Mapped[str] = mapped_column(String(32), unique=True, nullable=False)
    """Human-readable engagement id, format ENG-YYYY-NNNN."""

    client_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("clients.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
    )

    # Account state per Chirag Section 4. Note: 'pending' is a new state we
    # didn't have on Client before — login exists but T&C not yet accepted.
    # Rest mirrors Client.status but is authoritative for engagement.
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")

    # Tier mirrors Client.tier at engagement creation time and is kept in sync
    # by the admin controls. Duplicated intentionally — if we ever offer per-
    # engagement tier overrides (say Enterprise trial on a Growth account),
    # the Engagement is the source of truth.
    tier: Mapped[str] = mapped_column(String(20), nullable=False, default="tier1")

    # Scope in/out — lists of one-line strings the admin agrees at scoping call.
    # JSONB so admins can add/remove without a schema change. Each entry is
    # a plain string, not a structured object, to keep the editor simple.
    scope_in: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)
    scope_out: Mapped[list[str]] = mapped_column(JSONB, nullable=False, default=list)

    # Increments on any scope edit. Client re-acks on next login when their
    # acked_scope_version < engagement.scope_version. Starts at 1 on create.
    scope_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # Engine assignment per Section 3.1:
    #   'existing'  — reuse an existing live engine, e.g. VAM for a new client
    #   'bespoke'   — engineer builds a new engine for this client
    #   'manual'    — no engine; deliveries are hand-uploaded JSON. No tuning.
    engine_assignment: Mapped[str] = mapped_column(
        String(20), nullable=False, default="manual"
    )

    # FK to the engines table (added in Chirag Item #3). Nullable because
    # 'manual' engagements never have an engine, and 'bespoke' starts null
    # until the engineer provisions the engine row.
    engine_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("engines.id", ondelete="SET NULL")
    )

    # The strategy document version currently designated as source of truth
    # for this engagement's deliveries. Client can upload many versions;
    # the engineer marks one canonical. Powers the lifecycle stepper's
    # 'Strategy received' step.
    canonical_strategy_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("strategy_documents.id", ondelete="SET NULL")
    )

    # Which T&C version the CLIENT last accepted at engagement level. Separate
    # from per-user TermsAcceptance because engagements outlive individual users
    # (add/remove analysts) and we want a single answer for 'has this client
    # accepted the current terms'.
    accepted_tnc_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("terms_versions.id", ondelete="SET NULL")
    )

    # One-line summary of what the client is buying. Displayed in the client
    # scope panel, the admin drawer, the PDF report footer.
    deliverable: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # Meeting 2026-07-09: delivery + comms happen on WhatsApp, not through
    # the portal. Admin pastes the group link here after creating it out-of-
    # band; client sees a "Join our project WhatsApp" CTA on the dashboard.
    # Nullable because the group is created during onboarding, not at engage
    # creation time. Plain text — could be https://chat.whatsapp.com/xxx or
    # wa.me/<number>, the frontend just wraps whatever's stored in an <a>.
    whatsapp_group_link: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Which Service this engagement is delivering. Drives the LifecycleStepper
    # steps + client dashboard framing. Nullable during backfill; the migration
    # points every existing engagement at the 'backtesting' service. New
    # engagements MUST have a service (enforced in the create endpoint).
    service_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("services.id", ondelete="SET NULL")
    )

    __table_args__ = (
        CheckConstraint(
            "status IN ('pending','active','suspended','closed')",
            name="status_valid",
        ),
        CheckConstraint(
            "tier IN ('tier1','tier2','tier3')",
            name="tier_valid",
        ),
        CheckConstraint(
            "engine_assignment IN ('existing','bespoke','manual')",
            name="engine_assignment_valid",
        ),
        CheckConstraint(
            "scope_version >= 1",
            name="scope_version_positive",
        ),
    )
