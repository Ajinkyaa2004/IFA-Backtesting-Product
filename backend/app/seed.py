"""Seed script - provisions the main admin and a demo client.

Run:
    cd backend
    python -m app.seed
"""
import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from jsonschema import Draft202012Validator
from loguru import logger
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.security import create_firebase_user, get_firebase_user_by_email, init_firebase
from app.db.models import Backtest, BacktestFile, Client, TermsVersion, User
from app.db.session import SessionLocal
from app.services import storage

DEMO_CLIENT_NAME = "Sterling Capital Advisors"
DEMO_CLIENT_EMAIL = "demo.client@sterlingcap.test"
DEMO_CLIENT_PASSWORD = "DemoClient!2026"

TNC_V1_CLAUSES = [
    {"id": "c1", "title": "Engagement", "body": "The IFA team performs backtests and research deliverables based on strategy documents submitted via this portal.", "required": True},
    {"id": "c2", "title": "Confidentiality", "body": "All strategy documents, parameters, and results are confidential and not redistributed.", "required": True},
    {"id": "c3", "title": "Data", "body": "Market data is sourced from licensed vendors. No guarantee of completeness or accuracy beyond commercially reasonable diligence.", "required": True},
    {"id": "c4", "title": "Results", "body": "Backtest results are hypothetical. Past performance is not indicative of future results.", "required": True},
    {"id": "c5", "title": "Liability", "body": "Liability is limited as set out in the Master Services Agreement.", "required": True},
    {"id": "c6", "title": "Term and Termination", "body": "Either party may terminate with 30 days written notice.", "required": True},
    {"id": "c7", "title": "Change requests", "body": "Three change requests are included per engagement. Additional changes are chargeable.", "required": True},
    {"id": "c8", "title": "Governing law", "body": "This agreement is governed by the laws of the Republic of India. Disputes are subject to the courts of Mumbai.", "required": True},
]

# T&C v2.0 - approved by Anmol 2026-09 per the content-audit doc. Shorter,
# plainer, Upwork-compatible. Every clause is required so the UI is still a
# simple "tick each box" flow. Ids c1..c7 chosen deliberately to NOT collide
# with v1.0's c1..c8 semantically - v2 is a fresh set, not a diff of v1.
#
# Deployment semantics (matches audit note in Anmol's report):
#   - New clients see v2.0 on first sign-in and accept it.
#   - Existing clients who already accepted v1.0 stay accepted - the
#     `engagements.accepted_tnc_version_id` FK is version-locked, not
#     "latest-version", so the /me `needs_tnc_acceptance` gate stays False
#     for them. See app/api/v1/me.py for the check.
TNC_V2_CLAUSES = [
    {"id": "c1", "title": "What we do",              "body": "Insight Fusion Analytics performs backtests, research and code delivery based on the strategy documents and requests you submit through this portal.", "required": True},
    {"id": "c2", "title": "Confidentiality",         "body": "Your strategy documents, parameters, results and code are confidential. We do not share them with other clients or reuse them for anyone else.",       "required": True},
    {"id": "c3", "title": "Data",                    "body": "Market data comes from licensed vendors. We check it with reasonable care but cannot guarantee it is complete or error-free.",                          "required": True},
    {"id": "c4", "title": "Results are hypothetical","body": "Backtest results are not a record of real trading and do not predict future performance. Nothing in this portal is investment advice.",                 "required": True},
    {"id": "c5", "title": "Payment",                 "body": "For Upwork engagements, all payment goes through Upwork. For direct engagements, payment terms are in your written quote.",                              "required": True},
    {"id": "c6", "title": "Your account",            "body": "Keep your sign-in private. Tell us if you think it has been used by someone else.",                                                                       "required": True},
    {"id": "c7", "title": "Governing law",           "body": "These terms are governed by the laws of India. For Upwork engagements, Upwork's dispute process applies first.",                                          "required": True},
]


def ensure_firebase_user(email: str, password: str) -> str:
    init_firebase()
    existing = get_firebase_user_by_email(email)
    if existing:
        logger.info("Firebase user exists: {} ({})", email, existing.uid)
        return existing.uid
    uid = create_firebase_user(email=email, password=password)
    logger.info("Created Firebase user: {} ({})", email, uid)
    return uid


def seed(db: Session) -> None:
    settings = get_settings()
    now = datetime.now(timezone.utc)

    # 1. Terms v1.0
    tnc = db.query(TermsVersion).filter(TermsVersion.version == "v1.0").first()
    if not tnc:
        tnc = TermsVersion(
            version="v1.0",
            body="IFA Client Portal - Engagement Terms v1.0",
            clauses=TNC_V1_CLAUSES,
            effective_from=now,
        )
        db.add(tnc)
        db.flush()
        logger.info("Inserted T&C v1.0 ({})", tnc.id)
    else:
        logger.info("T&C v1.0 already exists ({})", tnc.id)

    # 1b. Terms v2.0 - the current published version. Idempotent: only insert
    # if a row keyed on version="v2.0" doesn't already exist. Effective_from is
    # bumped 1 second after v1.0 so listings ordered by effective_from
    # asc/desc always agree on which is newer even on a same-tick seed.
    #
    # We deliberately DO NOT touch any existing engagement's
    # accepted_tnc_version_id - clients who accepted v1.0 keep their
    # v1.0 signature and are NOT re-prompted. The /me needs_tnc_acceptance
    # gate compares against the engagement's stored version, not "latest".
    tnc_v2 = db.query(TermsVersion).filter(TermsVersion.version == "v2.0").first()
    if not tnc_v2:
        # effective_from must be strictly greater than v1.0's so
        # `ORDER BY effective_from DESC LIMIT 1` picks v2.0 as the current.
        v2_effective = tnc.effective_from + timedelta(seconds=1)
        tnc_v2 = TermsVersion(
            version="v2.0",
            body="IFA Client Portal - Engagement Terms v2.0",
            clauses=TNC_V2_CLAUSES,
            effective_from=v2_effective,
        )
        db.add(tnc_v2)
        db.flush()
        logger.info("Inserted T&C v2.0 ({})", tnc_v2.id)
    else:
        logger.info("T&C v2.0 already exists ({})", tnc_v2.id)

    # 2. Main admin
    admin_uid = ensure_firebase_user(settings.MAIN_ADMIN_EMAIL, settings.MAIN_ADMIN_INITIAL_PASSWORD)
    admin = db.query(User).filter(User.firebase_uid == admin_uid).first()
    if not admin:
        admin = User(
            firebase_uid=admin_uid,
            email=settings.MAIN_ADMIN_EMAIL,
            role="main_admin",
            status="active",
            client_id=None,
        )
        db.add(admin)
        db.flush()
        logger.info("Inserted main_admin user ({})", admin.id)
    else:
        logger.info("main_admin already exists ({})", admin.id)

    # 3. Demo client
    client = db.query(Client).filter(Client.name == DEMO_CLIENT_NAME).first()
    if not client:
        client = Client(
            name=DEMO_CLIENT_NAME,
            primary_contact="Aanya Mehra",
            tier="tier1",
            status="active",
            current_tnc_version_id=tnc.id,
        )
        db.add(client)
        db.flush()
        logger.info("Inserted demo client ({})", client.id)
    else:
        logger.info("Demo client already exists ({})", client.id)

    # 4. Demo client user
    client_uid = ensure_firebase_user(DEMO_CLIENT_EMAIL, DEMO_CLIENT_PASSWORD)
    client_user = db.query(User).filter(User.firebase_uid == client_uid).first()
    if not client_user:
        client_user = User(
            firebase_uid=client_uid,
            email=DEMO_CLIENT_EMAIL,
            role="client",
            status="active",
            client_id=client.id,
        )
        db.add(client_user)
        db.flush()
        logger.info("Inserted demo client user ({})", client_user.id)
    else:
        logger.info("Demo client user already exists ({})", client_user.id)

    # 5. Demo backtest - uses the locked v1.0 schema example file
    _seed_demo_backtest(db, client)

    db.commit()
    logger.success("Seed complete")
    logger.info("Main admin login: {} / {}", settings.MAIN_ADMIN_EMAIL, settings.MAIN_ADMIN_INITIAL_PASSWORD)
    logger.info("Demo client login: {} / {}", DEMO_CLIENT_EMAIL, DEMO_CLIENT_PASSWORD)


REPO_ROOT = Path(__file__).resolve().parents[2]  # ifa-backtest-product/
SCHEMA_PATH = REPO_ROOT / "schemas" / "backtest.schema.json"
EXAMPLE_PATH = REPO_ROOT / "schemas" / "backtest.example.json"


def _seed_demo_backtest(db: Session, client: Client) -> None:
    """Load schemas/backtest.example.json, validate against schema, upload to bucket,
    insert backtests + backtest_files rows. Plus a few dummy rows in other statuses."""
    existing = (
        db.query(Backtest)
        .filter(Backtest.client_id == client.id, Backtest.code == "BT-2026-0001")
        .first()
    )
    if existing:
        logger.info("Demo backtest already seeded ({})", existing.id)
    else:
        if not EXAMPLE_PATH.exists() or not SCHEMA_PATH.exists():
            logger.warning("Schema or example file not found, skipping demo backtest seed")
            return

        schema = json.loads(SCHEMA_PATH.read_text())
        example = json.loads(EXAMPLE_PATH.read_text())
        errors = list(Draft202012Validator(schema).iter_errors(example))
        if errors:
            logger.error("Demo backtest fails schema validation: {}", errors[:3])
            return

        bt_id = uuid.uuid4()
        # Stamp client id into the example payload
        example["client"] = {"client_id": str(client.id), "client_name": client.name}
        raw = json.dumps(example, ensure_ascii=False).encode("utf-8")
        checksum = hashlib.sha256(raw).hexdigest()

        storage_key = f"clients/{client.id}/backtests/{bt_id}/result.json"
        storage.upload_bytes(storage_key, raw, "application/json")

        backtest = Backtest(
            id=bt_id,
            client_id=client.id,
            name=example["strategy"]["name"],
            code=example["backtest_id"],
            status="completed",
            is_demo=True,  # never counts toward tier usage or "First backtest" step
            assumptions=example["assumptions"],
            metrics=example["metrics"],
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
        db.flush()
        logger.info("Seeded demo backtest BT-2026-0001 ({}) + result JSON in bucket", backtest.id)

    # ── 3 more FULLY-POPULATED example backtests. Each is a mutated copy of
    # example.json with a different strategy name, symbol set, date range, and
    # slightly altered metrics so the report page shows meaningful variety.
    # Kills the "Example real strategies preloaded" Todoist item - the list is
    # now demo-ready without hand-crafting every field.
    variants = [
        {
            "code": "BT-2026-0006",
            "name": "RSI Mean Reversion - Nifty Midcap",
            "type": "long_only",
            "description": "Long-only mean reversion on Nifty Midcap 100. Enter when RSI(14) < 30 AND close > 200-day SMA. Exit when RSI(14) crosses 55 OR 10-day trailing stop.",
            "tags": ["mean-reversion", "midcap", "swing"],
            "symbols": ["POLYCAB.NS", "AUBANK.NS", "TATAPOWER.NS", "DELHIVERY.NS", "COFORGE.NS"],
            "date_range": {"from": "2024-01-02", "to": "2025-12-31"},
            "metrics_delta": {"total_return_pct": 27.4, "sharpe": 1.31, "max_dd": -14.2},
        },
        {
            "code": "BT-2026-0007",
            "name": "Pairs Trade - HDFC / ICICI Bank",
            "type": "market_neutral",
            "description": "Market-neutral pairs trade on HDFC Bank vs ICICI Bank. Enter when z-score of the log-price spread exceeds ±2σ. Exit at reversion to 0.5σ.",
            "tags": ["pairs", "market-neutral", "stat-arb"],
            "symbols": ["HDFCBANK.NS", "ICICIBANK.NS"],
            "date_range": {"from": "2024-06-01", "to": "2025-12-31"},
            "metrics_delta": {"total_return_pct": 18.9, "sharpe": 1.72, "max_dd": -6.8},
        },
        {
            "code": "BT-2026-0008",
            "name": "Breakout Momentum - Nifty 50",
            "type": "long_only",
            "description": "Long-only 20-day high breakout on Nifty 50 constituents with 10-day ATR-based sizing. Exit on close below 10-day SMA.",
            "tags": ["breakout", "momentum", "nifty50"],
            "symbols": ["RELIANCE.NS", "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS", "SBIN.NS", "BHARTIARTL.NS"],
            "date_range": {"from": "2023-01-02", "to": "2025-12-31"},
            "metrics_delta": {"total_return_pct": 42.6, "sharpe": 1.05, "max_dd": -18.7},
        },
    ]
    if not EXAMPLE_PATH.exists():
        return
    example_template = json.loads(EXAMPLE_PATH.read_text())
    for v in variants:
        if db.query(Backtest).filter(Backtest.client_id == client.id, Backtest.code == v["code"]).first():
            continue
        # Deep-mutate the example. The v1.0 schema only cares about structural
        # validity; the metrics_delta values are surface-level tweaks so the UI
        # renders differently per row rather than 3 identical charts.
        payload = json.loads(json.dumps(example_template))  # deep copy
        payload["backtest_id"] = v["code"]
        payload["strategy"]["name"] = v["name"]
        payload["strategy"]["type"] = v["type"]
        payload["strategy"]["description"] = v["description"]
        payload["strategy"]["tags"] = v["tags"]
        payload["universe"]["symbols"] = v["symbols"]
        payload["universe"]["name"] = f"equity universe ({len(v['symbols'])} symbols)"
        payload["assumptions"]["date_range"] = v["date_range"]
        payload["client"] = {"client_id": str(client.id), "client_name": client.name}
        # Surface-level metric tweaks so cards don't look identical
        if "summary" in payload.get("metrics", {}):
            payload["metrics"]["summary"]["total_return_pct"] = v["metrics_delta"]["total_return_pct"]
            payload["metrics"]["summary"]["sharpe_ratio"] = v["metrics_delta"]["sharpe"]
            payload["metrics"]["summary"]["max_drawdown_pct"] = v["metrics_delta"]["max_dd"]

        bt_id = uuid.uuid4()
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        checksum = hashlib.sha256(raw).hexdigest()
        storage_key = f"clients/{client.id}/backtests/{bt_id}/result.json"
        storage.upload_bytes(storage_key, raw, "application/json")

        bt = Backtest(
            id=bt_id,
            client_id=client.id,
            name=v["name"],
            code=v["code"],
            status="completed",
            assumptions=payload["assumptions"],
            metrics=payload["metrics"],
            completed_at=datetime.now(timezone.utc),
        )
        db.add(bt)
        db.flush()
        db.add(BacktestFile(
            backtest_id=bt.id,
            file_type="result_json",
            storage_key=storage_key,
            size_bytes=len(raw),
            checksum=checksum,
        ))
        logger.info("Seeded backtest {} ({}) - {}", v["code"], bt.id, v["name"])
    db.flush()

    # ── Status-variety stubs (no JSON, minimal fields) so the filter chips have
    # something to show under quote/draft/in_progress/etc.
    dummies = [
        ("BT-2026-0002", "Mean Reversion BankNifty", "in_progress"),
        ("BT-2026-0003", "Momentum Smallcap",        "approved"),
        ("BT-2026-0004", "Pairs HDFC/ICICI",          "quote_sent"),
        ("BT-2026-0005", "Volatility Carry",          "draft"),
        ("BT-2026-0009", "Sector Rotation Trial",     "revision_requested"),
        ("BT-2026-0010", "Failed Momentum Test",      "cancelled"),
    ]
    for code, name, status_ in dummies:
        if db.query(Backtest).filter(Backtest.client_id == client.id, Backtest.code == code).first():
            continue
        db.add(
            Backtest(
                client_id=client.id,
                name=name,
                code=code,
                status=status_,
                assumptions=None,
                metrics=None,
            )
        )
    db.flush()


def _reset_local_state(db: Session) -> None:
    """Wipe backtests + strategies + requests + T&C acceptances for local
    dev. Keeps clients + users so re-seeding is fast. NEVER runs in
    production - refuses if APP_ENV != 'local'.
    """
    from app.core.config import get_settings
    from app.db.models import (
        Backtest, BacktestFile, StrategyDocument, Request,
        TermsAcceptance, AuditLog,
    )

    settings = get_settings()
    if settings.APP_ENV != "local":
        raise RuntimeError(
            f"seed --reset refuses to run in APP_ENV={settings.APP_ENV!r}. "
            "This is a destructive operation. If you REALLY want it, edit seed.py."
        )
    logger.warning("--reset requested - wiping local state (except clients + users)")
    for model in (BacktestFile, Backtest, StrategyDocument, Request, TermsAcceptance, AuditLog):
        n = db.query(model).delete()
        logger.info("  wiped {} × {}", n, model.__tablename__)
    db.commit()


if __name__ == "__main__":
    import sys
    reset = "--reset" in sys.argv
    db = SessionLocal()
    try:
        if reset:
            _reset_local_state(db)
        seed(db)
    finally:
        db.close()
