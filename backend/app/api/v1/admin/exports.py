"""Admin CSV export endpoints - Phase 4.6 Day 9.

Three endpoints that stream CSV downloads for common ops needs:
  GET /admin/exports/clients.csv    - all clients + tier + created + status
  GET /admin/exports/audit.csv      - full audit log (filterable)
  GET /admin/exports/backtests.csv  - all backtests across clients

Each endpoint audit-logs the export itself (with a row count) so we can
see 'who took what data off the platform when' after the fact.

CSV is streamed via StreamingResponse so a million-row export doesn't
buffer in memory. Row values are quoted per RFC 4180.
"""

from __future__ import annotations

import csv
import io
from datetime import datetime

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.deps import require_role
from app.db.models import AuditLog, Backtest, Client, User
from app.db.session import get_db
from app.services import audit

router = APIRouter()


def _csv_response(filename: str, rows_iter):
    """Wrap an iterator of dict rows into a streaming CSV response.

    First-row keys become the header. Everything is str()'d - cells with
    comma/quote/newline are escaped by csv.writer per RFC 4180.
    """
    def _generate():
        buf = io.StringIO()
        writer = csv.writer(buf)
        first = True
        for row in rows_iter:
            if first:
                writer.writerow(list(row.keys()))
                first = False
            writer.writerow([_cell(v) for v in row.values()])
            yield buf.getvalue()
            buf.seek(0)
            buf.truncate(0)
        # Empty result — still emit a header row if we know the shape? For MVP
        # we let the caller see 0 bytes and infer 'no rows'. Fine.

    return StreamingResponse(
        _generate(),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Cache-Control": "private, no-store",
        },
    )


def _cell(v) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime):
        return v.isoformat()
    if isinstance(v, (dict, list)):
        # JSON columns — stringify compactly so a spreadsheet sees one cell.
        import json
        return json.dumps(v, separators=(",", ":"), ensure_ascii=False)
    return str(v)


@router.get("/exports/clients.csv")
def export_clients_csv(
    request: Request,
    include_deleted: bool = Query(default=False),
    admin=Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    q = db.query(Client)
    if not include_deleted:
        q = q.filter(Client.deleted_at.is_(None))
    rows = q.order_by(desc(Client.created_at)).all()

    def _iter():
        for c in rows:
            yield {
                "id": c.id,
                "name": c.name,
                "primary_contact": c.primary_contact,
                "tier": c.tier,
                "status": c.status,
                "vam_enabled": bool(c.vam_enabled),
                "created_at": c.created_at,
                "deleted_at": c.deleted_at,
            }

    audit.record(
        db, actor_user_id=admin.id, action="admin.export.clients",
        target_type="clients", target_id=None,
        payload={"row_count": len(rows), "include_deleted": include_deleted},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    return _csv_response(f"clients_{datetime.utcnow().strftime('%Y%m%d')}.csv", _iter())


@router.get("/exports/audit.csv")
def export_audit_csv(
    request: Request,
    action_prefix: str | None = None,
    limit: int = Query(default=5000, le=50000),
    admin=Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    q = db.query(AuditLog, User.email).outerjoin(User, User.id == AuditLog.actor_user_id)
    if action_prefix:
        q = q.filter(AuditLog.action.startswith(action_prefix))
    rows = q.order_by(desc(AuditLog.created_at)).limit(limit).all()

    def _iter():
        for a, email in rows:
            yield {
                "id": a.id,
                "occurred_at": a.created_at,
                "actor_email": email,
                "actor_user_id": a.actor_user_id,
                "action": a.action,
                "target_type": a.target_type,
                "target_id": a.target_id,
                "ip": a.ip,
                "payload": a.payload,
            }

    audit.record(
        db, actor_user_id=admin.id, action="admin.export.audit",
        target_type="audit_log", target_id=None,
        payload={"row_count": len(rows), "action_prefix": action_prefix},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    return _csv_response(f"audit_{datetime.utcnow().strftime('%Y%m%d')}.csv", _iter())


@router.get("/exports/backtests.csv")
def export_backtests_csv(
    request: Request,
    admin=Depends(require_role("main_admin", "sub_admin")),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Backtest, Client.name.label("client_name"))
        .outerjoin(Client, Client.id == Backtest.client_id)
        .order_by(desc(Backtest.created_at))
        .all()
    )

    def _iter():
        for bt, client_name in rows:
            yield {
                "id": bt.id,
                "code": bt.code,
                "name": bt.name,
                "client_id": bt.client_id,
                "client_name": client_name,
                "status": bt.status,
                "engine": bt.engine,
                "created_at": bt.created_at,
                "completed_at": bt.completed_at,
                "strategy_version_id": bt.strategy_version_id,
            }

    audit.record(
        db, actor_user_id=admin.id, action="admin.export.backtests",
        target_type="backtests", target_id=None,
        payload={"row_count": len(rows)},
        ip=request.client.host if request.client else None,
    )
    db.commit()
    return _csv_response(f"backtests_{datetime.utcnow().strftime('%Y%m%d')}.csv", _iter())
