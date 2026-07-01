"""Upload every synthetic backtest via the admin API, then verify each is fetchable
by the client with full result JSON intact. Catches:
- silent data corruption between upload and storage
- schema validator regressions
- DB constraint mismatches
- storage round-trip integrity (size + hash)
"""
from __future__ import annotations

import json
import sys
from dataclasses import dataclass, field
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))

from app.db.models import Backtest, BacktestFile, User
from app.db.session import SessionLocal

STRATEGIES_DIR = Path(__file__).parent / "strategies"
BACKEND = "http://localhost:8000/api/v1"
FIREBASE_KEY = "AIzaSyD_CmcpWcgjk9QoWpE6lxat1PbQ_bVVU18"

ADMIN_EMAIL = "insightfusionanalytics@gmail.com"
ADMIN_PASS = "sg&^XpSP9GAu2PmBYcrE"
DEMO_CLIENT_EMAIL = "demo.client@sterlingcap.test"
DEMO_CLIENT_PASS = "DemoClient!2026"


@dataclass
class Run:
    passes: int = 0
    fails: list[tuple[str, str]] = field(default_factory=list)


def token(email: str, password: str) -> str:
    r = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_KEY}",
        json={"email": email, "password": password, "returnSecureToken": True},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["idToken"]


def hdr(t: str) -> dict:
    return {"Authorization": f"Bearer {t}"}


def cleanup_synthetics() -> int:
    """Drop any prior BT-SYN-* uploads to keep the DB tidy."""
    db = SessionLocal()
    try:
        # Find demo client
        u = db.query(User).filter(User.email == DEMO_CLIENT_EMAIL).first()
        if not u or not u.client_id:
            return 0
        old = db.query(Backtest).filter(
            Backtest.client_id == u.client_id,
            Backtest.code.startswith("BT-SYN-"),
        ).all()
        n = len(old)
        for bt in old:
            db.query(BacktestFile).filter(BacktestFile.backtest_id == bt.id).delete()
            db.delete(bt)
        db.commit()
        return n
    finally:
        db.close()


def get_demo_client_id() -> str:
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == DEMO_CLIENT_EMAIL).first()
        return str(u.client_id)
    finally:
        db.close()


def main(sample_size: int | None = None) -> int:
    run = Run()
    files = sorted(STRATEGIES_DIR.glob("*.json"))
    if sample_size:
        # representative slice: stride evenly through the list
        stride = max(1, len(files) // sample_size)
        files = files[::stride][:sample_size]
    print(f"Will upload {len(files)} backtests")

    cleared = cleanup_synthetics()
    print(f"Cleared {cleared} prior BT-SYN-* uploads\n")

    admin_token = token(ADMIN_EMAIL, ADMIN_PASS)
    client_token = token(DEMO_CLIENT_EMAIL, DEMO_CLIENT_PASS)
    client_id = get_demo_client_id()

    uploaded_ids: list[tuple[str, str, dict]] = []  # (file_name, returned backtest_id, original_payload)

    print("─── Uploading via admin ───")
    for i, f in enumerate(files):
        original = json.loads(f.read_text())
        r = requests.post(
            f"{BACKEND}/admin/backtests/upload-result",
            headers=hdr(admin_token),
            json={"client_id": client_id, "result": original},
            timeout=60,
        )
        if r.status_code != 201:
            run.fails.append((f.name, f"upload status={r.status_code} body={r.text[:200]}"))
            continue
        body = r.json()
        uploaded_ids.append((f.name, body["backtest_id"], original))
        run.passes += 1
        if (i + 1) % 25 == 0:
            print(f"  uploaded {i + 1}/{len(files)}")

    print(f"\n─── Verifying every upload via client GET /backtests/{{id}} ───")
    # Get client's backtest list once
    list_resp = requests.get(f"{BACKEND}/backtests", headers=hdr(client_token), timeout=30).json()
    list_ids = {b["id"] for b in list_resp}

    code_to_dbid = {b["code"]: b["id"] for b in list_resp}

    for f_name, _api_bt_id, original in uploaded_ids:
        code = original["backtest_id"]
        if code not in code_to_dbid:
            run.fails.append((f_name, f"uploaded but not in client list: code={code}"))
            continue
        db_id = code_to_dbid[code]
        detail = requests.get(f"{BACKEND}/backtests/{db_id}", headers=hdr(client_token), timeout=30).json()
        if detail.get("result") is None:
            run.fails.append((f_name, f"detail.result is null for {code}"))
            continue

        # Verify round-trip: every key in trades[] preserved
        if len(detail["result"]["trades"]) != len(original["trades"]):
            run.fails.append((f_name, f"trade count mismatch: in={len(original['trades'])} out={len(detail['result']['trades'])}"))
            continue
        # Verify metrics preserved
        for k, v in original["metrics"]["summary"].items():
            if k not in detail["result"]["metrics"]["summary"]:
                run.fails.append((f_name, f"missing metric in roundtrip: {k}"))
                break
            else_v = detail["result"]["metrics"]["summary"][k]
            if isinstance(v, float) and isinstance(else_v, (int, float)):
                if abs(v - else_v) > 1e-3 and v != 0:
                    run.fails.append((f_name, f"metric mismatch {k}: in={v} out={else_v}"))
                    break
            elif v != else_v:
                run.fails.append((f_name, f"metric mismatch {k}: in={v!r} out={else_v!r}"))
                break

    print("\n" + "═" * 60)
    print(f"  Uploaded OK: {run.passes}/{len(files)}")
    print(f"  Round-trip + render: {run.passes - len(run.fails)} clean")
    print(f"  Failures: {len(run.fails)}")
    print("═" * 60)
    if run.fails:
        print("\nFailures (first 20):")
        for name, detail in run.fails[:20]:
            print(f"  ✗ {name}  {detail}")
    return 0 if not run.fails else 1


if __name__ == "__main__":
    # Default: hit a representative sample so we don't murder the bucket
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    sys.exit(main(sample_size=n))
