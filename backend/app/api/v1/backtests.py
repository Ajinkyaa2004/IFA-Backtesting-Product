from __future__ import annotations

import json
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from loguru import logger
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from app.core.deps import client_scope, current_user
from app.core.tier_deps import require_feature
from app.db.models import Backtest, BacktestFile, Client, StrategyDocument, TermsAcceptance, TermsVersion, User
from app.db.session import get_db
from app.services import audit, benchmark, report, storage
from app.services.storage import StorageObjectMissing

router = APIRouter()


class BacktestListItem(BaseModel):
    id: str
    code: str
    name: str
    status: str
    engine: str  # 'manual' (v1.0 schema) or 'vam' (VAM-native) - drives renderer choice
    is_demo: bool = False  # canned example row - UI badges as DEMO
    completed_at: datetime | None
    created_at: datetime


class BacktestDetail(BaseModel):
    id: str
    code: str
    name: str
    status: str
    engine: str  # see BacktestListItem.engine
    is_demo: bool = False
    assumptions: dict | None
    metrics: dict | None
    result: dict | None  # Full envelope from storage - v1.0 or vam-1.0 shape per `engine`
    # New in LT1/PB1 fix — the frontend renders three distinct empty
    # states off this instead of the ambiguous "Awaiting delivery"
    # sitting silently over a broken storage layer.
    #   "ok"          — result is present (or none needed because status<completed)
    #   "not_written" — file row exists but the bytes are missing (staging
    #                   inconsistency; happens when we redeploy without
    #                   migrating storage-local, or Supabase project sleeps)
    #   "storage_error" — the backend couldn't reach storage at all
    result_status: str = "ok"
    completed_at: datetime | None
    created_at: datetime


@router.get("/backtests", response_model=list[BacktestListItem])
def list_backtests(
    client_id: uuid.UUID = Depends(client_scope),
    db: Session = Depends(get_db),
    status_filter: str | None = Query(default=None, alias="status"),
):
    q = db.query(Backtest).filter(Backtest.client_id == client_id)
    if status_filter:
        q = q.filter(Backtest.status == status_filter)
    rows = q.order_by(desc(Backtest.created_at)).all()
    return [
        BacktestListItem(
            id=str(r.id),
            code=r.code,
            name=r.name,
            status=r.status,
            engine=r.engine,
            is_demo=bool(r.is_demo),
            completed_at=r.completed_at,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.get("/backtests/{backtest_id}", response_model=BacktestDetail)
def get_backtest(
    backtest_id: uuid.UUID,
    client_id: uuid.UUID = Depends(client_scope),
    db: Session = Depends(get_db),
):
    row = (
        db.query(Backtest)
        .filter(Backtest.id == backtest_id, Backtest.client_id == client_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Backtest not found")

    result_payload: dict | None = None
    result_status = "ok"
    result_file = (
        db.query(BacktestFile)
        .filter(BacktestFile.backtest_id == row.id, BacktestFile.file_type == "result_json")
        .first()
    )
    if result_file:
        try:
            raw = storage.download_bytes(result_file.storage_key)
            result_payload = json.loads(raw)
        except StorageObjectMissing:
            # File row exists in the DB, bytes are gone. This is what
            # bit us during the Supabase-paused window + the storage-local
            # container rebuild. Distinct from generic error so the client
            # UI can show "result file missing — contact admin" instead of
            # the ambiguous "Awaiting delivery".
            result_status = "not_written"
            logger.warning(
                "Backtest {} result file missing at {} - storage returned no object",
                row.id, result_file.storage_key,
            )
        except Exception as e:
            result_status = "storage_error"
            logger.exception(
                "Backtest {} result download failed at {}: {}",
                row.id, result_file.storage_key, e,
            )

    return BacktestDetail(
        id=str(row.id),
        code=row.code,
        name=row.name,
        status=row.status,
        engine=row.engine,
        is_demo=bool(row.is_demo),
        assumptions=row.assumptions,
        metrics=row.metrics,
        result=result_payload,
        result_status=result_status,
        completed_at=row.completed_at,
        created_at=row.created_at,
    )


_ENGINE_LABEL = {
    "manual": "Manual JSON upload (v1.0 schema)",
    "vam":    "VAM engine - Insight Fusion Analytics",
}


@router.get(
    "/backtests/{backtest_id}/benchmark",
    dependencies=[Depends(require_feature("benchmark_comparison"))],
)
def get_backtest_benchmark(
    backtest_id: uuid.UUID,
    client_id: uuid.UUID = Depends(client_scope),
    db: Session = Depends(get_db),
):
    """Synthetic benchmark curves aligned to a backtest's date range.

    Frontend overlays these on the equity chart. Section 10 asked for
    'Real benchmark data (dummy)' - we ship a deterministic-synthetic
    generator (see services/benchmark.py) so demos look real without
    external network calls or a yfinance dependency.

    Response shape:
      { source, from, to, series: {SPY: [...], NIFTY50: [...], BTC-USD: [...]}, meta: [...] }
    """
    row = (
        db.query(Backtest)
        .filter(Backtest.id == backtest_id, Backtest.client_id == client_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Backtest not found")

    assumptions = row.assumptions or {}
    dr = assumptions.get("date_range") or {}
    from_d = benchmark.parse_date(dr.get("from"))
    to_d   = benchmark.parse_date(dr.get("to"))

    return benchmark.build_benchmark_series(from_d, to_d)


@router.get("/backtests/{backtest_id}/report.pdf")
def download_backtest_report(
    backtest_id: uuid.UUID,
    request: Request,
    user: User = Depends(current_user),
    client_id: uuid.UUID = Depends(client_scope),
    db: Session = Depends(get_db),
):
    """Renders the client-facing backtest PDF report on demand.

    The report intentionally embeds the four mandatory legal disclaimers
    (Section 15) plus the T&C version the client accepted plus a SHA-256
    of the source result JSON. This means the delivered PDF has evidentiary
    weight against later 'these numbers changed' disputes.
    """
    row = (
        db.query(Backtest)
        .filter(Backtest.id == backtest_id, Backtest.client_id == client_id)
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Backtest not found")
    if row.status != "completed":
        raise HTTPException(
            status_code=409,
            detail=f"Reports are only generated for completed backtests. Current status: {row.status}.",
        )

    result_file = (
        db.query(BacktestFile)
        .filter(BacktestFile.backtest_id == row.id, BacktestFile.file_type == "result_json")
        .first()
    )
    if not result_file:
        raise HTTPException(
            status_code=404,
            detail="Result JSON not attached to this backtest - cannot render report.",
        )

    try:
        raw = storage.download_bytes(result_file.storage_key)
        result_json = json.loads(raw)
    except StorageObjectMissing as e:
        # File was written once but the bytes are gone — same root as the
        # LT1 "Awaiting delivery" bug. Give the client a specific message
        # so they know to ping admin rather than assume the export flow
        # is broken across every backtest they have.
        logger.warning("Result file missing for backtest {} at {}", row.id, result_file.storage_key)
        raise HTTPException(
            status_code=410,
            detail="This backtest's result file is no longer available. Contact your account manager to redeliver.",
        ) from e
    except Exception as e:
        logger.warning("Failed to load result JSON for backtest {}: {}", row.id, e)
        raise HTTPException(status_code=502, detail="Failed to load result payload from storage") from e

    # Client + T&C context
    client = db.query(Client).filter(Client.id == client_id).first()
    client_name = client.name if client else "Unknown client"

    tnc_version_str = "-"
    tnc_accepted_at: str | None = None
    if client and client.current_tnc_version_id:
        tv = db.query(TermsVersion).filter(TermsVersion.id == client.current_tnc_version_id).first()
        if tv:
            tnc_version_str = tv.version
        acc = (
            db.query(TermsAcceptance)
            .filter(
                TermsAcceptance.client_id == client_id,
                TermsAcceptance.terms_version_id == client.current_tnc_version_id,
            )
            .order_by(desc(TermsAcceptance.accepted_at))
            .first()
        )
        if acc:
            tnc_accepted_at = acc.accepted_at.strftime("%Y-%m-%d")

    # Strategy version label
    strategy_version_label: str | None = None
    if row.strategy_version_id:
        sd = db.query(StrategyDocument).filter(StrategyDocument.id == row.strategy_version_id).first()
        if sd:
            strategy_version_label = f"{sd.name} · v{sd.version}"

    engine_label = _ENGINE_LABEL.get(row.engine, row.engine)

    try:
        pdf_bytes = report.render_backtest_report_pdf(
            backtest_code=row.code,
            strategy_name=row.name,
            strategy_version=strategy_version_label,
            strategy_description=(result_json.get("strategy") or {}).get("description"),
            engine_label=engine_label,
            client_name=client_name,
            tnc_version=tnc_version_str,
            tnc_accepted_at=tnc_accepted_at,
            result_checksum=result_file.checksum or "unknown",
            result_json=result_json,
        )
    except Exception as e:
        logger.exception("PDF render failure for backtest {}", row.id)
        raise HTTPException(status_code=500, detail=f"Report rendering failed: {e}") from e

    audit.record(
        db,
        actor_user_id=user.id,
        action="backtest.report.export",
        target_type="backtest",
        target_id=row.id,
        payload={"code": row.code, "size_bytes": len(pdf_bytes)},
        ip=request.client.host if request.client else None,
    )
    db.commit()

    filename = f"{row.code}_{row.name.replace(' ', '_')}.pdf"[:120]
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            # 'inline' so the browser previews the PDF instead of forcing a download
            "Content-Disposition": f'inline; filename="{filename}"',
            "Cache-Control": "private, max-age=0, no-store",
        },
    )
