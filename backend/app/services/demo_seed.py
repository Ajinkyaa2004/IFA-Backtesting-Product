"""Provision a demo backtest for a freshly approved client.

Called from the signup-approval endpoint so every new client's dashboard
has one canned example to look at while they wait for their first real
result. The row is flagged `is_demo=True` so the UI can badge it clearly
and, if we ever choose to, hide it once real work lands.

The demo payload is `schemas/backtest.example.json` — the same asset the
seed script uses for Sterling. Loading it inline keeps a single source
of truth: fix a bug in the example, both Sterling and every new signup
benefit.

Best-effort: every failure is logged but never raised. Approval must
succeed even if the schema file is missing or storage briefly hiccups —
admin can rerun via a manual endpoint later. We do NOT flush/commit
here; the caller owns the transaction.
"""

from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from jsonschema import Draft202012Validator
from loguru import logger
from sqlalchemy.orm import Session

from app.db.models import Backtest, BacktestFile, Client
from app.services import storage

# `backend/app/services/demo_seed.py` → parents[3] is the repo root.
_REPO_ROOT = Path(__file__).resolve().parents[3]
_SCHEMA_PATH = _REPO_ROOT / "schemas" / "backtest.schema.json"
_EXAMPLE_PATH = _REPO_ROOT / "schemas" / "backtest.example.json"

_DEMO_CODE_PREFIX = "BT-DEMO"


def _next_demo_code(db: Session) -> str:
    """Generate a unique BT-DEMO-NNNN code across ALL clients so the code
    field's UNIQUE-ish semantics are preserved even though the constraint
    is per-row. Padded to 4 digits."""
    count = (
        db.query(Backtest)
        .filter(Backtest.code.like(f"{_DEMO_CODE_PREFIX}-%"))
        .count()
    )
    return f"{_DEMO_CODE_PREFIX}-{count + 1:04d}"


def provision_demo_backtest(db: Session, client: Client) -> Backtest | None:
    """Create one demo backtest + its result JSON in local storage for the
    given client. Returns the new row on success, None on any failure.
    Never raises.
    """
    try:
        if not _EXAMPLE_PATH.exists() or not _SCHEMA_PATH.exists():
            logger.warning(
                "demo_seed: schema or example asset missing at {} / {} — skipping",
                _SCHEMA_PATH, _EXAMPLE_PATH,
            )
            return None

        schema = json.loads(_SCHEMA_PATH.read_text())
        example = json.loads(_EXAMPLE_PATH.read_text())
        errors = list(Draft202012Validator(schema).iter_errors(example))
        if errors:
            logger.error(
                "demo_seed: example.json fails schema validation ({} errors) — skipping",
                len(errors),
            )
            return None

        # Stamp the client into the payload so the report renderer picks up
        # the right name in headers/footers.
        example["client"] = {
            "client_id": str(client.id),
            "client_name": client.name,
        }
        # Give this row a unique demo code so multiple clients don't share
        # BT-2026-0001. (Sterling's seed row keeps BT-2026-0001; this is
        # for freshly-approved signup clients.)
        code = _next_demo_code(db)
        example["backtest_id"] = code

        raw = json.dumps(example, ensure_ascii=False).encode("utf-8")
        checksum = hashlib.sha256(raw).hexdigest()

        bt_id = uuid.uuid4()
        storage_key = f"clients/{client.id}/backtests/{bt_id}/result.json"
        storage.upload_bytes(storage_key, raw, "application/json")

        backtest = Backtest(
            id=bt_id,
            client_id=client.id,
            name=f"Demo — {example['strategy']['name']}",
            code=code,
            status="completed",
            engine="manual",
            is_demo=True,
            assumptions=example["assumptions"],
            metrics=example["metrics"],
            completed_at=datetime.now(timezone.utc),
        )
        db.add(backtest)
        db.flush()

        db.add(
            BacktestFile(
                backtest_id=backtest.id,
                file_type="result_json",
                storage_key=storage_key,
                size_bytes=len(raw),
                checksum=checksum,
            )
        )
        db.flush()

        logger.info(
            "demo_seed: provisioned demo backtest {} ({}) for client {}",
            code, bt_id, client.id,
        )
        return backtest
    except Exception as e:
        # Approval should never fail because of the demo asset. Log loudly,
        # let the outer transaction proceed.
        logger.exception("demo_seed: provisioning failed for client {}: {}", client.id, e)
        return None
