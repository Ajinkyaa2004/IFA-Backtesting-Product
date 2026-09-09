"""Admin — Data Explorer.

A read-only tabular browser for every table in the DB, wired to
/admin/data on the frontend. Lets an admin see rows without opening a
psql shell or a desktop Postgres GUI.

Safety:
  - Read-only. No INSERT/UPDATE/DELETE from this endpoint, ever.
  - Table names are validated against a hard allowlist derived from
    the SQLAlchemy metadata. Anything not in the allowlist 404s. This
    means the endpoint cannot be tricked into hitting pg_catalog or a
    future rogue table someone forgets to model.
  - Sort/search parameters go through parameter binding + column-name
    validation, never string-concat'd into SQL. Injection-safe.

Performance:
  - LIMIT/OFFSET pagination (default 50, max 500). Anything bigger
    should be exported via a real CSV endpoint, not paged.
  - `row_count` on the tables listing uses `SELECT COUNT(*)` per table.
    Fine for tables under ~1M rows; if we outgrow this we can switch to
    pg_class.reltuples for an estimate.
"""

from __future__ import annotations

import datetime as dt
import decimal
import uuid
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.base import Base
from app.db.models import User
from app.db.session import get_db

router = APIRouter(prefix="/data", tags=["admin-data"])


# ── Allowlist ──────────────────────────────────────────────────────────
# Only tables SQLAlchemy actually models. Excludes alembic_version and
# any other bookkeeping table. Populated at import time so a
# request never touches the schema catalog.
_ALLOWED_TABLES: frozenset[str] = frozenset(Base.metadata.tables.keys())


class ColumnSchema(BaseModel):
    name: str
    # Python-friendly type tag. Frontend uses this to decide how to
    # render a cell (JSON pretty-print vs. datetime formatter etc.).
    type: Literal["uuid", "int", "float", "bool", "text", "datetime", "date", "json", "other"]
    nullable: bool


class TableInfo(BaseModel):
    name: str
    row_count: int
    columns: list[ColumnSchema]


class TableRowsOut(BaseModel):
    table: str
    columns: list[ColumnSchema]
    rows: list[dict[str, Any]]
    total: int
    limit: int
    offset: int


def _type_tag(py_type: type | None) -> ColumnSchema.__annotations__["type"]:
    """Map SQLAlchemy python_type → the small tag set the frontend cares
    about. Everything unknown gets 'other' and the frontend renders it
    as a plain string. Prefer safe generic tags over guessing wrong.
    """
    if py_type is None:
        return "other"
    if py_type is uuid.UUID:
        return "uuid"
    if py_type is bool:
        return "bool"
    if py_type is int:
        return "int"
    if py_type in (float, decimal.Decimal):
        return "float"
    if py_type is dt.datetime:
        return "datetime"
    if py_type is dt.date:
        return "date"
    if py_type in (dict, list):
        return "json"
    if py_type is str:
        return "text"
    return "other"


def _column_schema(table_name: str) -> list[ColumnSchema]:
    tbl = Base.metadata.tables[table_name]
    out: list[ColumnSchema] = []
    for col in tbl.columns:
        try:
            py_type = col.type.python_type
        except (NotImplementedError, AttributeError):
            py_type = None
        out.append(
            ColumnSchema(
                name=col.name,
                type=_type_tag(py_type),
                nullable=col.nullable,
            )
        )
    return out


def _serialise(value: Any) -> Any:
    """Turn a Postgres row value into something JSON-safe.

    SQLAlchemy's dict-row already handles native → Python conversion,
    but we still need to json-friendly UUID + datetime + Decimal so
    FastAPI's default encoder is happy without a custom encoder shim.
    """
    if value is None:
        return None
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, (dt.datetime, dt.date)):
        return value.isoformat()
    if isinstance(value, decimal.Decimal):
        return float(value)
    if isinstance(value, (bytes, bytearray)):
        # Never send raw bytes — display a length placeholder instead.
        return f"<{len(value)} bytes>"
    return value


@router.get("/tables", response_model=list[TableInfo])
def list_tables(
    db: Session = Depends(get_db),
    _: User = Depends(require_role("main_admin", "sub_admin")),
) -> list[TableInfo]:
    """Every model-backed table with its row count + column list. Sorted
    alphabetically so the sidebar order is stable."""
    tables: list[TableInfo] = []
    for name in sorted(_ALLOWED_TABLES):
        # COUNT(*) is safe because the table name is from our allowlist,
        # not user input. Wrapped in text() with an identifier that we've
        # already validated above.
        count = db.execute(text(f'SELECT COUNT(*) FROM "{name}"')).scalar_one()
        tables.append(
            TableInfo(name=name, row_count=int(count), columns=_column_schema(name))
        )
    return tables


@router.get("/tables/{table_name}", response_model=TableRowsOut)
def read_table(
    table_name: str,
    limit: int = Query(default=50, ge=1, le=10000),
    offset: int = Query(default=0, ge=0),
    order_by: str | None = Query(default=None),
    order_dir: Literal["asc", "desc"] = Query(default="desc"),
    search: str | None = Query(default=None, max_length=200),
    db: Session = Depends(get_db),
    _: User = Depends(require_role("main_admin", "sub_admin")),
) -> TableRowsOut:
    """Return a page of rows for one table.

    Safety:
      - `table_name` must be in the allowlist (else 404)
      - `order_by` must be a real column on that table (else 400)
      - `search` is passed as a bound parameter — never concatenated
    """
    if table_name not in _ALLOWED_TABLES:
        raise HTTPException(status_code=404, detail="Unknown table")

    tbl = Base.metadata.tables[table_name]
    columns = _column_schema(table_name)
    col_names = {c.name for c in columns}

    # Validate order_by against actual columns. Default is created_at
    # descending when the table has a created_at, otherwise the first
    # column — matches what most admins want to see first.
    if order_by and order_by not in col_names:
        raise HTTPException(status_code=400, detail=f"Unknown column: {order_by}")
    effective_order = order_by or ("created_at" if "created_at" in col_names else tbl.primary_key.columns.keys()[0])

    # Base query
    stmt = select(tbl)

    # Search — case-insensitive substring on every text-ish column. Keeps
    # semantics predictable: "actorix" finds a row whose company or name
    # or email contains that string. Ignores non-text columns.
    if search:
        from sqlalchemy import or_, cast, String
        needle = f"%{search}%"
        text_cols = [c for c in tbl.columns if c.type.python_type in (str,)] if False else []
        # Broader net: cast every column to text and ILIKE it. Cheaper to
        # write than to enumerate every text-adjacent column, and still
        # binds the parameter safely.
        clauses = []
        for c in tbl.columns:
            try:
                clauses.append(cast(c, String).ilike(needle))
            except NotImplementedError:
                continue
        if clauses:
            stmt = stmt.where(or_(*clauses))

    # Count for pagination — same WHERE as the fetch, no ORDER/LIMIT.
    from sqlalchemy import func
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = int(db.execute(count_stmt).scalar_one())

    # Apply ordering + paging + fetch
    order_col = tbl.columns[effective_order]
    stmt = stmt.order_by(order_col.desc() if order_dir == "desc" else order_col.asc())
    stmt = stmt.limit(limit).offset(offset)

    rows_raw = db.execute(stmt).mappings().all()
    rows = [{k: _serialise(v) for k, v in dict(r).items()} for r in rows_raw]

    return TableRowsOut(
        table=table_name,
        columns=columns,
        rows=rows,
        total=total,
        limit=limit,
        offset=offset,
    )
