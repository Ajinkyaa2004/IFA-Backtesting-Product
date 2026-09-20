"""quote_files - proposal documents attached to quotes, with revision history

Admin attaches a proposal file to a quote; the client reads it on their
Quotes card. Every revision that was sent is kept forever (append-only).
A draft quote may hold one unsent "working copy" (revision NULL) which
becomes revision 1 when the quote is sent.

Revision ID: g11k88765001
Revises: f99i66543001
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "g11k88765001"
down_revision: Union[str, None] = "f99i66543001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "quote_files",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("quote_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("quotes.id", ondelete="CASCADE"), nullable=False),
        sa.Column("revision", sa.Integer()),
        sa.Column("filename", sa.String(255), nullable=False),
        sa.Column("mime_type", sa.String(100), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("checksum", sa.String(64), nullable=False),
        sa.Column("storage_key", sa.String(500), nullable=False),
        sa.Column("note", sa.Text()),
        sa.Column("uploaded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("quote_id", "revision", name="quote_file_revision_uniq"),
        sa.CheckConstraint(
            "(revision IS NULL AND sent_at IS NULL) OR (revision IS NOT NULL AND sent_at IS NOT NULL)",
            name="quote_file_published_consistent",
        ),
        sa.CheckConstraint("revision IS NULL OR revision >= 1", name="quote_file_revision_positive"),
    )
    op.create_index("ix_quote_files_quote_id", "quote_files", ["quote_id"])
    # At most one unsent working copy per quote.
    op.create_index(
        "quote_file_one_working_copy",
        "quote_files",
        ["quote_id"],
        unique=True,
        postgresql_where=sa.text("revision IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("quote_file_one_working_copy", table_name="quote_files")
    op.drop_index("ix_quote_files_quote_id", table_name="quote_files")
    op.drop_table("quote_files")
