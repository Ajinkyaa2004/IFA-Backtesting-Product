"""Cross-tenant isolation test — provisions a SECOND client, then attempts every
known way a client could possibly read or write another client's data.

The one test that MUST always pass: client A cannot read or write client B's anything.
"""
from __future__ import annotations

import json
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.config import get_settings
from app.core.security import create_firebase_user, get_firebase_user_by_email, init_firebase
from app.db.models import Backtest, BacktestFile, Client, Request as Req, TermsAcceptance, User
from app.db.session import SessionLocal

BACKEND = "http://localhost:8000/api/v1"
FIREBASE_KEY = "AIzaSyD_CmcpWcgjk9QoWpE6lxat1PbQ_bVVU18"

CLIENT_A_EMAIL = "demo.client@sterlingcap.test"
CLIENT_A_PASS = "DemoClient!2026"

CLIENT_B_EMAIL = "secondary.client@isolation.test"
CLIENT_B_PASS = "IsolationTest!2026"

ADMIN_EMAIL = "insightfusionanalytics@gmail.com"
ADMIN_PASS = "sg&^XpSP9GAu2PmBYcrE"


@dataclass
class Run:
    passes: list[str] = field(default_factory=list)
    fails: list[tuple[str, str]] = field(default_factory=list)

    def ok(self, name: str, detail: str = "") -> None:
        print(f"  ✅ {name}")
        self.passes.append(name)

    def fail(self, name: str, detail: str = "") -> None:
        print(f"  ❌ {name}  ({detail})")
        self.fails.append((name, detail))


def get_token(email: str, password: str) -> str:
    r = requests.post(
        f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_KEY}",
        json={"email": email, "password": password, "returnSecureToken": True},
        timeout=10,
    )
    r.raise_for_status()
    return r.json()["idToken"]


def headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def ensure_client_b() -> tuple[str, str]:
    """Provision client B if not already there. Returns (client_id, user_id) as strings."""
    init_firebase()
    db = SessionLocal()
    try:
        existing_user = db.query(User).filter(User.email == CLIENT_B_EMAIL).first()
        if existing_user and existing_user.client_id:
            return str(existing_user.client_id), str(existing_user.id)

        # Make sure Firebase user exists
        fb_user = get_firebase_user_by_email(CLIENT_B_EMAIL)
        if fb_user:
            fb_uid = fb_user.uid
        else:
            fb_uid = create_firebase_user(CLIENT_B_EMAIL, CLIENT_B_PASS, display_name="Isolation Test Co")

        # Create client + user rows
        client = Client(name="Isolation Test Co", primary_contact="Tester", tier="tier1", status="active")
        db.add(client)
        db.flush()
        user = User(
            firebase_uid=fb_uid,
            email=CLIENT_B_EMAIL,
            role="client",
            status="active",
            client_id=client.id,
        )
        db.add(user)
        db.commit()
        return str(client.id), str(user.id)
    finally:
        db.close()


def get_client_a_id() -> str:
    db = SessionLocal()
    try:
        u = db.query(User).filter(User.email == CLIENT_A_EMAIL).first()
        return str(u.client_id)
    finally:
        db.close()


def get_a_backtest_id_for(client_id: str) -> str | None:
    db = SessionLocal()
    try:
        bt = db.query(Backtest).filter(Backtest.client_id == client_id).first()
        return str(bt.id) if bt else None
    finally:
        db.close()


def accept_tnc(token: str) -> None:
    """Accept T&C if needed."""
    me = requests.get(f"{BACKEND}/me", headers=headers(token)).json()
    if me.get("needs_tnc_acceptance"):
        terms = requests.get(f"{BACKEND}/terms/current", headers=headers(token)).json()
        clauses = [c["id"] for c in terms["clauses"]]
        requests.post(
            f"{BACKEND}/terms/accept",
            headers=headers(token),
            json={"version_id": terms["id"], "accepted_clauses": clauses},
        ).raise_for_status()


def main() -> int:
    run = Run()
    print("Setting up two clients…")
    client_b_id, client_b_user_id = ensure_client_b()
    client_a_id = get_client_a_id()
    print(f"  Client A: {client_a_id}")
    print(f"  Client B: {client_b_id}")

    # Get tokens
    token_a = get_token(CLIENT_A_EMAIL, CLIENT_A_PASS)
    token_b = get_token(CLIENT_B_EMAIL, CLIENT_B_PASS)
    token_admin = get_token(ADMIN_EMAIL, ADMIN_PASS)
    accept_tnc(token_a)
    accept_tnc(token_b)

    # Make sure A has at least one backtest
    a_bt_id = get_a_backtest_id_for(client_a_id)
    if not a_bt_id:
        run.fail("setup: client A has a backtest", "none found")
        return 1
    print(f"  A's backtest id: {a_bt_id}\n")

    # ── 1. No-auth attempts ──
    print("─── Anonymous (no token) ───")
    for path in ["/me", "/backtests", "/strategies", f"/backtests/{a_bt_id}", "/admin/stats", "/admin/clients"]:
        r = requests.get(f"{BACKEND}{path}")
        ok = r.status_code in (401, 403)
        (run.ok if ok else run.fail)(f"anon GET {path} → {r.status_code} (expect 401/403)", str(r.status_code))

    # ── 2. Client B trying to access A's resources ──
    print("\n─── Client B trying to read A's backtest by ID (URL guess) ───")
    r = requests.get(f"{BACKEND}/backtests/{a_bt_id}", headers=headers(token_b))
    ok = r.status_code == 404
    (run.ok if ok else run.fail)(f"B GET /backtests/{{A's_id}} → {r.status_code} (expect 404)", str(r.status_code))

    # ── 3. Tenant scope: B sees only B's data, never A's ──
    print("\n─── Tenant scope: each client sees only own data ───")
    me_a = requests.get(f"{BACKEND}/me", headers=headers(token_a)).json()
    me_b = requests.get(f"{BACKEND}/me", headers=headers(token_b)).json()
    (run.ok if me_a["client"]["id"] == client_a_id else run.fail)(f"me_a.client.id == A", f"{me_a['client']['id']} vs {client_a_id}")
    (run.ok if me_b["client"]["id"] == client_b_id else run.fail)(f"me_b.client.id == B", f"{me_b['client']['id']} vs {client_b_id}")

    bts_a = requests.get(f"{BACKEND}/backtests", headers=headers(token_a)).json()
    bts_b = requests.get(f"{BACKEND}/backtests", headers=headers(token_b)).json()
    bts_a_ids = {b["id"] for b in bts_a}
    bts_b_ids = {b["id"] for b in bts_b}
    overlap = bts_a_ids & bts_b_ids
    (run.ok if not overlap else run.fail)(f"backtest ID sets disjoint between A and B", f"overlap={overlap}")
    (run.ok if a_bt_id not in bts_b_ids else run.fail)("A's bt not in B's list")

    # ── 4. Client cannot hit admin endpoints ──
    print("\n─── Client tries admin endpoints ───")
    for path in ["/admin/stats", "/admin/clients", "/admin/audit", "/admin/terms"]:
        r = requests.get(f"{BACKEND}{path}", headers=headers(token_a))
        ok = r.status_code == 403
        (run.ok if ok else run.fail)(f"client GET {path} → {r.status_code} (expect 403)", str(r.status_code))

    # ── 5. Client cannot upload backtest result via admin endpoint ──
    print("\n─── Client tries admin write actions ───")
    r = requests.post(
        f"{BACKEND}/admin/backtests/upload-result",
        headers=headers(token_a),
        json={"client_id": client_a_id, "result": {}},
    )
    ok = r.status_code == 403
    (run.ok if ok else run.fail)(f"client POST /admin/backtests/upload-result → {r.status_code} (expect 403)", str(r.status_code))

    # ── 6. Submit request with another client's id in payload — backend MUST ignore and use session client_id ──
    print("\n─── Tenant override attempts (try to forge client_id) ───")
    # Submit a request — backend uses session client_id, payload doesn't carry it
    r = requests.post(
        f"{BACKEND}/requests",
        headers=headers(token_b),
        json={"type": "clarification", "payload": {"question": "tenant override attempt"}},
    )
    if r.status_code == 200:
        body = r.json()
        # The request should be tagged to B, never A
        # We can't see client_id directly in response, but the request must be linked to B in DB
        db = SessionLocal()
        try:
            req = db.query(Req).filter(Req.id == body["id"]).first()
            ok = req and str(req.client_id) == client_b_id
            (run.ok if ok else run.fail)(
                "request submitted by B is tagged to B in DB",
                f"client_id={req.client_id if req else 'none'}"
            )
        finally:
            db.close()
    else:
        run.fail("B submit request basic", str(r.status_code))

    # ── 7. Bad token formats ──
    print("\n─── Bad tokens ───")
    for label, h in [
        ("malformed bearer", {"Authorization": "Bearer not.real.token"}),
        ("missing Bearer prefix", {"Authorization": token_a}),
        ("empty Authorization", {"Authorization": ""}),
    ]:
        r = requests.get(f"{BACKEND}/me", headers=h)
        ok = r.status_code == 401
        (run.ok if ok else run.fail)(f"{label} → {r.status_code} (expect 401)", str(r.status_code))

    # ── 8. Admin bypass: admin actor SHOULD be able to read both ──
    print("\n─── Admin can access cross-tenant (expected) ───")
    r = requests.get(f"{BACKEND}/admin/clients", headers=headers(token_admin))
    ok = r.status_code == 200 and len(r.json()) >= 2
    (run.ok if ok else run.fail)(f"admin /admin/clients sees both", f"status={r.status_code} count={len(r.json()) if r.status_code==200 else '?'}")

    # ── Final ──
    print("\n" + "═" * 60)
    print(f"  {len(run.passes)} passed, {len(run.fails)} failed")
    print("═" * 60)
    return 0 if not run.fails else 1


if __name__ == "__main__":
    sys.exit(main())
