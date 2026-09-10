"""Shared persistence helper for VAM-engine backtest runs.

Both the admin endpoint (POST /admin/vam/run) and the client endpoint
(POST /vam/run) call into here. The two endpoints differ only in:

  * who's allowed to call (admin role vs any authenticated client)
  * what's recorded as `triggered_by.actor_type` in the persisted envelope
  * whether a rate limit applies (clients yes, admins no)

The persistence pipeline itself is identical to the manual upload flow in
admin/backtests.py - same Supabase Storage layout, same backtests table
row, same audit log shape - except:

  * `engine` column is set to "vam"
  * payload is validated against schemas/backtest.vam.schema.json (NOT v1.0)
  * the backtest_id / code is minted by us, not pulled from VAM
  * the run-time params + linked strategy + actor are folded into the envelope
"""
from __future__ import annotations

import hashlib
import json
import random
import string
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import HTTPException, status
from jsonschema import Draft202012Validator
from loguru import logger
from sqlalchemy.orm import Session

from app.db.models import Backtest, BacktestFile, Client, StrategyDocument, User
from app.services import audit, storage

# ── Schema path resolution mirrors admin/backtests.py ──────────────────────
# repo_root/schemas/backtest.vam.schema.json
_REPO_ROOT = Path(__file__).resolve().parents[3]
_VAM_SCHEMA_PATH = _REPO_ROOT / "schemas" / "backtest.vam.schema.json"


def _load_vam_schema() -> dict:
    if not _VAM_SCHEMA_PATH.exists():
        raise RuntimeError(f"VAM schema not found at {_VAM_SCHEMA_PATH}")
    return json.loads(_VAM_SCHEMA_PATH.read_text())


# Friendly labels for the backtests.name column — what the client actually
# sees in their list. Keep these compact; the params + engine response carry
# the full detail.
_STEP_LABELS: dict[str, str] = {
    "step1": "VAM Core (step 1)",
    "step2": "VAM + UPRO leverage (step 2)",
    "step3": "VAM step 3",
    "step4_svix": "VAM + SVIX short-vol (step 4 SVIX)",
    "step4_combined": "VAM Combined (step 4)",
}


def mint_backtest_code() -> str:
    """Generate a unique-ish backtest code: BT-YYYYMMDDHHmmss-XXXX.

    Format chosen so codes sort chronologically as strings AND the random
    suffix avoids collisions if two runs land in the same second.
    """
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    suffix = "".join(random.choices(string.ascii_uppercase + string.digits, k=4))
    return f"BT-{stamp}-{suffix}"


def _resolve_strategy_version(
    db: Session, client_id: uuid.UUID, strategy_id_str: str | None
) -> uuid.UUID | None:
    """Validate that a referenced strategy_id belongs to this client.

    Cross-tenant guard: even an admin endpoint MUST verify the strategy doc
    actually belongs to the target client, so a typo'd UUID can't link a
    backtest to a strategy from a different organisation.
    """
    if not strategy_id_str:
        return None
    try:
        sid = uuid.UUID(strategy_id_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="strategy_id is not a valid UUID")
    sdoc = (
        db.query(StrategyDocument)
        .filter(StrategyDocument.id == sid, StrategyDocument.client_id == client_id)
        .first()
    )
    if not sdoc:
        raise HTTPException(
            status_code=404,
            detail="Strategy not found, or it does not belong to the target client",
        )
    return sdoc.id


def _build_envelope(
    *,
    backtest_id_str: str,
    client: Client,
    step: str,
    params: dict,
    vam_response: dict,
    actor_type: Literal["admin", "client"],
    actor: User,
) -> dict:
    """Wrap VAM's raw response in our envelope. Body matches backtest.vam.schema.json."""
    return {
        "schema_version": "vam-1.0",
        "result_type": "vam_backtest",
        "backtest_id": backtest_id_str,
        "source": "vam",
        "step": step,
        "params": params,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "client": {"client_id": str(client.id), "client_name": client.name},
        "triggered_by": {
            "actor_type": actor_type,
            "actor_id": str(actor.id),
            "actor_email": getattr(actor, "email", "") or "",
        },
        "engine_response": vam_response,
    }


def persist_vam_run(
    *,
    db: Session,
    client: Client,
    step: str,
    params: dict,
    vam_response: dict,
    actor: User,
    actor_type: Literal["admin", "client"],
    strategy_id_str: str | None = None,
    ip: str | None = None,
) -> tuple[Backtest, str]:
    """Validate the VAM payload, persist it, and return (Backtest row, storage_key).

    Raises HTTPException on validation failure (422) or missing references (404/400).
    The caller is responsible for handling VAM-side failures BEFORE calling this -
    by the time we're here, we expect a successful VAM response.
    """
    if step not in _STEP_LABELS:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown VAM step '{step}'. Expected one of: {sorted(_STEP_LABELS)}",
        )

    strategy_version_id = _resolve_strategy_version(db, client.id, strategy_id_str)

    code = mint_backtest_code()
    bt_id = uuid.uuid4()
    envelope = _build_envelope(
        backtest_id_str=code,
        client=client,
        step=step,
        params=params,
        vam_response=vam_response,
        actor_type=actor_type,
        actor=actor,
    )

    # Schema-validate the envelope before persisting. If VAM ever returns a shape we
    # don't recognise, fail loudly here rather than corrupting the storage bucket.
    schema = _load_vam_schema()
    errors = list(Draft202012Validator(schema).iter_errors(envelope))
    if errors:
        violations = [
            {"path": "/".join(str(p) for p in e.absolute_path), "message": e.message}
            for e in errors[:25]
        ]
        logger.warning(
            "VAM response failed our VAM-1.0 schema for client {} step {}: {} violations",
            client.id, step, len(violations),
        )
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "error": "VAM response did not match expected shape",
                "violations": violations,
            },
        )

    # Friendly display name: prefer the linked strategy's name (so the row reads
    # like "Momentum Smallcap (via VAM)" in the client's list), else fall back to
    # the canonical step label.
    if strategy_version_id is not None:
        sdoc = db.query(StrategyDocument).filter(StrategyDocument.id == strategy_version_id).first()
        name = f"{sdoc.name} (via VAM)" if sdoc else _STEP_LABELS[step]
    else:
        name = _STEP_LABELS[step]

    raw = json.dumps(envelope, ensure_ascii=False).encode("utf-8")
    checksum = hashlib.sha256(raw).hexdigest()
    storage_key = f"clients/{client.id}/backtests/{bt_id}/result.json"
    storage.upload_bytes(storage_key, raw, "application/json")

    backtest = Backtest(
        id=bt_id,
        client_id=client.id,
        strategy_version_id=strategy_version_id,
        name=name,
        code=code,
        status="completed",
        engine="vam",
        # Mirror just the metrics block into the JSONB column so it's queryable
        # without a Storage round-trip (used by the list page + admin filters).
        # The full envelope (with chart_data + trades) stays in Storage.
        metrics=vam_response.get("metrics", {}),
        assumptions={"step": step, "params": params},
        completed_at=datetime.now(timezone.utc),
    )
    db.add(backtest)
    db.flush()
    bf = BacktestFile(
        backtest_id=backtest.id,
        file_type="result_json",
        storage_key=storage_key,
        size_bytes=len(raw),
        checksum=checksum,
    )
    db.add(bf)

    audit.record(
        db,
        actor_user_id=actor.id,
        action="backtest.vam.run",
        target_type="backtest",
        target_id=backtest.id,
        payload={
            "client_id": str(client.id),
            "code": backtest.code,
            "name": backtest.name,
            "step": step,
            "actor_type": actor_type,
            "size_bytes": len(raw),
        },
        ip=ip,
    )
    db.commit()
    logger.info(
        "VAM run persisted: {} by {} for client {} (step={})",
        backtest.code, actor_type, client.name, step,
    )
    return backtest, storage_key
