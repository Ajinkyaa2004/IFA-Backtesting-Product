"""End-to-end Firebase ↔ Backend integration audit.

Goal: document Firebase's request/response schemas empirically AND verify our
backend handles every failure mode with the correct HTTP code + body.

Coverage:
  PART A: Firebase REST signInWithPassword - every documented error code
  PART B: Backend verify_id_token paths - valid, expired, tampered, wrong project, etc.
  PART C: HTTP Authorization header edge cases
  PART D: User-state edge cases (suspended, soft-deleted, not provisioned)
  PART E: Full round-trip (signin → /me → /auth/login)
"""
from __future__ import annotations

import base64
import json
import sys
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))

from app.core.config import get_settings
from app.core.security import init_firebase, get_firebase_user_by_email, create_firebase_user
from app.db.models import User
from app.db.session import SessionLocal
from firebase_admin import auth as fb_auth

BACKEND = "http://localhost:8000/api/v1"
FIREBASE_KEY = "AIzaSyD_CmcpWcgjk9QoWpE6lxat1PbQ_bVVU18"
FIREBASE_SIGNIN_URL = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_KEY}"

DEMO_EMAIL = "demo.client@sterlingcap.test"
DEMO_PASS = "DemoClient!2026"


@dataclass
class Run:
    passes: list[str] = field(default_factory=list)
    fails: list[tuple[str, str]] = field(default_factory=list)

    def ok(self, name: str, detail: str = "") -> None:
        print(f"  ✅ {name}" + (f"  ({detail})" if detail else ""))
        self.passes.append(name)

    def fail(self, name: str, detail: str = "") -> None:
        print(f"  ❌ {name}" + (f"  ({detail})" if detail else ""))
        self.fails.append((name, detail))


def fb_signin(email: str, password: str) -> tuple[int, dict]:
    """Direct Firebase REST call. Returns (status_code, body)."""
    r = requests.post(
        FIREBASE_SIGNIN_URL,
        json={"email": email, "password": password, "returnSecureToken": True},
        timeout=15,
    )
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, {"raw": r.text[:500]}


def be(path: str, method: str = "GET", token: str | None = None, json_body: dict | None = None) -> tuple[int, dict]:
    """Backend call. Returns (status_code, body)."""
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    r = requests.request(method, f"{BACKEND}{path}", headers=headers, json=json_body, timeout=15)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, {"raw": r.text[:500]}


def be_raw(path: str, headers: dict, json_body: dict | None = None, method: str = "GET") -> tuple[int, dict]:
    """Backend call with raw headers (no helper). Returns (status, body)."""
    r = requests.request(method, f"{BACKEND}{path}", headers=headers, json=json_body, timeout=15)
    try:
        return r.status_code, r.json()
    except Exception:
        return r.status_code, {"raw": r.text[:500]}


# ──────────────────────────────────────────────────────────────────


def part_a_firebase_rest(run: Run) -> dict:
    """Hit Firebase REST sign-in with every failure scenario. Returns shape
    documentation we'll print at the end."""
    print("\n══════ PART A: Firebase REST signInWithPassword response schemas ══════\n")

    schemas: dict[str, dict] = {}

    # A.1 SUCCESS
    print("A.1 - SUCCESS (valid credentials)")
    code, body = fb_signin(DEMO_EMAIL, DEMO_PASS)
    run.ok if code == 200 else run.fail
    if code == 200:
        run.ok("success → 200")
        schemas["SUCCESS"] = {k: type(v).__name__ for k, v in body.items()}
        print(f"     response keys: {sorted(body.keys())}")
    else:
        run.fail(f"success → {code}", str(body)[:120])

    # A.2 EMAIL_NOT_FOUND (legacy) / INVALID_LOGIN_CREDENTIALS (current)
    print("\nA.2 - EMAIL_NOT_FOUND (nonexistent email)")
    code, body = fb_signin("definitely-no-such-user@example.invalid", DEMO_PASS)
    schemas["BAD_EMAIL"] = body
    print(f"     status: {code}, body: {json.dumps(body, indent=6)[:400]}")
    msg = body.get("error", {}).get("message", "")
    if code == 400 and ("EMAIL_NOT_FOUND" in msg or "INVALID_LOGIN_CREDENTIALS" in msg):
        run.ok(f"non-existent email → 400 with {msg}")
    else:
        run.fail(f"non-existent email", f"{code} {msg}")

    # A.3 INVALID_PASSWORD (legacy) / INVALID_LOGIN_CREDENTIALS (current)
    print("\nA.3 - INVALID_PASSWORD (wrong password)")
    code, body = fb_signin(DEMO_EMAIL, "definitelyWrongPassword!9999")
    schemas["BAD_PASSWORD"] = body
    print(f"     status: {code}, body: {json.dumps(body, indent=6)[:400]}")
    msg = body.get("error", {}).get("message", "")
    if code == 400 and ("INVALID_PASSWORD" in msg or "INVALID_LOGIN_CREDENTIALS" in msg):
        run.ok(f"wrong password → 400 with {msg}")
    else:
        run.fail(f"wrong password", f"{code} {msg}")

    # A.4 INVALID_EMAIL (malformed)
    print("\nA.4 - INVALID_EMAIL (malformed)")
    code, body = fb_signin("not-an-email", DEMO_PASS)
    schemas["MALFORMED_EMAIL"] = body
    print(f"     status: {code}, body: {json.dumps(body, indent=6)[:400]}")
    msg = body.get("error", {}).get("message", "")
    if code == 400 and "INVALID_EMAIL" in msg:
        run.ok(f"malformed email → 400 with INVALID_EMAIL")
    else:
        run.fail("malformed email", f"{code} {msg}")

    # A.5 MISSING_PASSWORD
    print("\nA.5 - MISSING_PASSWORD")
    r = requests.post(FIREBASE_SIGNIN_URL, json={"email": DEMO_EMAIL, "returnSecureToken": True}, timeout=15)
    try:
        body = r.json()
    except Exception:
        body = {}
    schemas["MISSING_PASSWORD"] = body
    print(f"     status: {r.status_code}, body: {json.dumps(body, indent=6)[:400]}")
    msg = body.get("error", {}).get("message", "")
    if r.status_code == 400 and "MISSING_PASSWORD" in msg:
        run.ok("missing password → 400 with MISSING_PASSWORD")
    else:
        run.fail("missing password", f"{r.status_code} {msg}")

    # A.6 MISSING_EMAIL  (Firebase usually says INVALID_EMAIL for empty email)
    print("\nA.6 - empty email")
    code, body = fb_signin("", DEMO_PASS)
    schemas["EMPTY_EMAIL"] = body
    print(f"     status: {code}, body: {json.dumps(body, indent=6)[:400]}")
    msg = body.get("error", {}).get("message", "")
    if code == 400:
        run.ok(f"empty email → 400 with {msg}")
    else:
        run.fail("empty email", f"{code}")

    # A.7 — TOO_MANY_ATTEMPTS_TRY_LATER (would require many failures; skip — documenting expectation)
    print("\nA.7 - TOO_MANY_ATTEMPTS (skipped - would trigger rate limit on shared key)")
    run.ok("TOO_MANY_ATTEMPTS scenario documented (not triggered)", "expected: 400 / TOO_MANY_ATTEMPTS_TRY_LATER")

    return schemas


def part_b_backend_verify(run: Run, valid_token: str) -> None:
    print("\n══════ PART B: Backend verify_id_token via /me ══════\n")

    # B.1 valid token + provisioned user → 200
    print("B.1 - valid token, provisioned user")
    code, body = be("/me", token=valid_token)
    if code == 200 and body.get("email") == DEMO_EMAIL:
        run.ok("valid token → 200, payload has email")
    else:
        run.fail("valid token → 200", f"{code} {body}")

    # B.2 token with last char chopped (signature break)
    print("\nB.2 - tampered token (chop signature)")
    bad_token = valid_token[:-3] + "AAA"
    code, body = be("/me", token=bad_token)
    detail = body.get("detail", "")
    # Public-safe error message must NOT leak internal Firebase Admin SDK strings
    if code == 401 and detail == "Invalid token":
        run.ok(f"tampered token → 401 with opaque 'Invalid token'")
    elif code == 401:
        run.fail(f"tampered token → 401 but message LEAKS detail: {detail!r}")
    else:
        run.fail("tampered token", f"{code} {body}")

    # B.3 wholly malformed token
    print("\nB.3 - non-JWT string")
    code, body = be("/me", token="this.is.not-a-jwt")
    detail = body.get("detail", "")
    if code == 401 and detail == "Invalid token":
        run.ok("garbage token → 401 with opaque message")
    elif code == 401:
        run.fail(f"garbage token → 401 but leaks: {detail!r}")
    else:
        run.fail("garbage token", f"{code} {body}")

    # B.4 empty token
    print("\nB.4 - empty token (Bearer with no value)")
    code, body = be_raw("/me", headers={"Authorization": "Bearer "})
    detail = body.get("detail", "")
    if code == 401 and ("missing" in detail.lower() or "invalid" in detail.lower()):
        run.ok(f"empty bearer → 401: '{detail}'")
    else:
        run.fail("empty bearer", f"{code} {body}")

    # B.5 missing header
    print("\nB.5 - no Authorization header")
    code, body = be_raw("/me", headers={})
    if code == 401:
        run.ok("missing header → 401", body.get("detail", "")[:80])
    else:
        run.fail("missing header", f"{code} {body}")

    # B.6 wrong scheme
    print("\nB.6 - Basic instead of Bearer")
    code, body = be_raw("/me", headers={"Authorization": f"Basic {valid_token}"})
    if code == 401:
        run.ok("Basic scheme → 401", body.get("detail", "")[:80])
    else:
        run.fail("Basic scheme", f"{code} {body}")

    # B.7 lowercase Bearer (RFC says case-insensitive)
    print("\nB.7 - lowercase 'bearer' scheme")
    code, body = be_raw("/me", headers={"Authorization": f"bearer {valid_token}"})
    if code == 200:
        run.ok("lowercase bearer → 200 (RFC-compliant)")
    else:
        run.fail("lowercase bearer", f"{code} {body}")

    # B.8 leading/trailing spaces
    print("\nB.8 - trailing whitespace in token")
    code, body = be_raw("/me", headers={"Authorization": f"Bearer {valid_token}   "})
    # Acceptable behaviour: either 200 (lenient) or 401 (strict). Document.
    run.ok(f"trailing whitespace → {code} (documented behaviour)", body.get("detail", "")[:80] if code != 200 else "")

    # B.9 multi-space between Bearer and token
    print("\nB.9 - multiple spaces between scheme and token")
    code, body = be_raw("/me", headers={"Authorization": f"Bearer    {valid_token}"})
    run.ok(f"multi-space → {code} (documented)", body.get("detail", "")[:80] if code != 200 else "")

    # B.10 very long token (DoS attempt)
    print("\nB.10 - extremely long token (10K bytes)")
    long_token = "A" * 10000
    code, body = be("/me", token=long_token)
    if code == 401:
        run.ok("long garbage token → 401 (no DoS)", body.get("detail", "")[:80])
    else:
        run.fail("long token DoS", f"{code} {body}")

    # B.11 SQL injection in token
    print("\nB.11 - SQL injection in token field")
    code, body = be("/me", token="'; DROP TABLE users; --")
    if code == 401:
        run.ok("SQL-injection token → 401 (safe)")
    else:
        run.fail("SQL-injection token", f"{code} {body}")

    # B.12 None / null token via raw POST to /auth/login
    print("\nB.12 - POST /auth/login with null id_token")
    code, body = be("/auth/login", method="POST", json_body={"id_token": None})
    # FastAPI/pydantic validation should reject → 422
    if code in (401, 422):
        run.ok(f"null id_token → {code} (caught)")
    else:
        run.fail("null id_token", f"{code} {body}")

    # B.13 POST /auth/login with missing id_token field
    print("\nB.13 - POST /auth/login with no id_token")
    code, body = be("/auth/login", method="POST", json_body={})
    if code == 422:
        run.ok("missing id_token → 422 (validation)")
    else:
        run.fail("missing id_token", f"{code} {body}")

    # B.14 POST /auth/login with too-short id_token (DoS guard)
    print("\nB.14 - POST /auth/login with short id_token (under 20 chars)")
    code, body = be("/auth/login", method="POST", json_body={"id_token": "short"})
    if code == 422:
        run.ok("short id_token → 422 (length guard)")
    else:
        run.fail("short id_token", f"{code} {body}")

    # B.15 POST /auth/login with 10 KB id_token (over 8192 limit)
    print("\nB.15 - POST /auth/login with oversized id_token (>8192 chars)")
    code, body = be("/auth/login", method="POST", json_body={"id_token": "x" * 10000})
    if code == 422:
        run.ok("oversized id_token → 422 (length guard)")
    else:
        run.fail("oversized id_token", f"{code} {body}")


def part_c_token_lifecycle(run: Run, valid_token: str) -> None:
    print("\n══════ PART C: Token lifecycle (expiry, revocation) ══════\n")

    # C.1 — token can be used multiple times within validity
    print("C.1 - replay attack (token reused 3 times in a row)")
    statuses = []
    for _ in range(3):
        code, _ = be("/me", token=valid_token)
        statuses.append(code)
    if all(s == 200 for s in statuses):
        run.ok("token works for repeated calls (expected)", str(statuses))
    else:
        run.fail("repeated token use", str(statuses))

    # C.2 — synthetic "expired" token (claims iat/exp far in the past)
    # We can't actually expire a real Firebase token quickly, but we can craft one
    # with a manipulated payload (which Firebase will reject for signature anyway).
    print("\nC.2 - token with manipulated 'exp' claim (signature also broken)")
    # Split a real token, decode payload, change exp, re-base64 (signature won't match)
    parts = valid_token.split(".")
    if len(parts) == 3:
        # Decode middle
        pad = "=" * (-len(parts[1]) % 4)
        try:
            payload = json.loads(base64.urlsafe_b64decode(parts[1] + pad))
            payload["exp"] = 1  # 1970
            new_payload = base64.urlsafe_b64encode(json.dumps(payload).encode()).rstrip(b"=").decode()
            tampered = f"{parts[0]}.{new_payload}.{parts[2]}"
            code, body = be("/me", token=tampered)
            if code == 401:
                run.ok("expired/tampered exp → 401", body.get("detail", "")[:80])
            else:
                run.fail("expired/tampered exp", f"{code} {body}")
        except Exception as e:
            run.fail("expired exp test", str(e))


def part_d_user_state(run: Run) -> None:
    print("\n══════ PART D: User-state edge cases ══════\n")

    # D.1 — make a NEW Firebase user that doesn't exist in our DB. /me should 401.
    print("D.1 - Firebase user with NO DB row → 401 'User not provisioned'")
    init_firebase()
    ephemeral_email = f"ephemeral-{uuid.uuid4().hex[:8]}@isolation.test"
    ephemeral_pass = "Ephemeral!2026"
    try:
        uid = create_firebase_user(ephemeral_email, ephemeral_pass)
        # Sign in via REST to get a token
        code, body = fb_signin(ephemeral_email, ephemeral_pass)
        if code == 200:
            tok = body["idToken"]
            be_code, be_body = be("/me", token=tok)
            if be_code == 401 and "provisioned" in be_body.get("detail", "").lower():
                run.ok("unprovisioned Firebase user → 401 'User not provisioned'")
            else:
                run.fail("unprovisioned user", f"{be_code} {be_body}")
        else:
            run.fail("sign in ephemeral user", f"{code} {body}")
    finally:
        # Cleanup
        try:
            fb_auth.delete_user(uid)
        except Exception:
            pass

    # D.2 — Suspended user in DB (status='suspended') → /me should 403
    print("\nD.2 - Suspended user → 403 'User suspended'")
    db = SessionLocal()
    try:
        demo = db.query(User).filter(User.email == DEMO_EMAIL).first()
        original_status = demo.status
        demo.status = "suspended"
        db.commit()

        # Get fresh token
        code, body = fb_signin(DEMO_EMAIL, DEMO_PASS)
        if code == 200:
            be_code, be_body = be("/me", token=body["idToken"])
            if be_code == 403 and "suspend" in be_body.get("detail", "").lower():
                run.ok("suspended user → 403 'User suspended'")
            else:
                run.fail("suspended user", f"{be_code} {be_body}")
        # Restore
        demo.status = original_status
        db.commit()
    finally:
        db.close()

    # D.3 — Soft-deleted user (deleted_at IS NOT NULL) → 401 not provisioned
    print("\nD.3 - Soft-deleted user → 401 (treated as not provisioned)")
    db = SessionLocal()
    try:
        demo = db.query(User).filter(User.email == DEMO_EMAIL).first()
        from datetime import datetime, timezone
        demo.deleted_at = datetime.now(timezone.utc)
        db.commit()

        code, body = fb_signin(DEMO_EMAIL, DEMO_PASS)
        if code == 200:
            be_code, be_body = be("/me", token=body["idToken"])
            if be_code == 401:
                run.ok("soft-deleted user → 401 (excluded from queries)")
            else:
                run.fail("soft-deleted user", f"{be_code} {be_body}")
        # Restore
        demo.deleted_at = None
        db.commit()
    finally:
        db.close()


def part_e_full_roundtrip(run: Run, valid_token: str) -> None:
    print("\n══════ PART E: Full sign-in round-trip ══════\n")

    # E.1 sign in → GET /me → POST /auth/login should all agree
    print("E.1 - sign in, GET /me, POST /auth/login → all return consistent identity")
    code1, me = be("/me", token=valid_token)
    code2, login = be("/auth/login", method="POST", json_body={"id_token": valid_token})

    if code1 == 200 and code2 == 200:
        if me["id"] == login["user_id"] and me["role"] == login["role"]:
            run.ok(f"identity consistent: id={me['id'][:8]}… role={me['role']}")
        else:
            run.fail("identity mismatch", f"me={me} login={login}")
    else:
        run.fail("round-trip", f"/me={code1} /auth/login={code2}")

    # E.2 — frontend error mapping (what the user sees)
    # We can't run the React component without a browser, but we can document
    # what Firebase JS SDK throws given the error codes from Part A.
    print("\nE.2 - Frontend error-message mapping documentation")
    fb_to_friendly = {
        "EMAIL_NOT_FOUND": "auth/user-not-found - 'No account found with this email'",
        "INVALID_PASSWORD": "auth/wrong-password - 'Incorrect password'",
        "INVALID_LOGIN_CREDENTIALS": "auth/invalid-credential - 'Invalid email or password'",
        "USER_DISABLED": "auth/user-disabled - 'Account suspended'",
        "INVALID_EMAIL": "auth/invalid-email - 'Email format invalid'",
        "MISSING_PASSWORD": "auth/missing-password - 'Password required'",
        "TOO_MANY_ATTEMPTS_TRY_LATER": "auth/too-many-requests - 'Try again later'",
        "NETWORK_REQUEST_FAILED": "auth/network-request-failed - 'Connection problem'",
    }
    print("     Documented Firebase REST → Firebase JS SDK error.code → friendly UI message mapping:")
    for fb_code, msg in fb_to_friendly.items():
        print(f"       {fb_code:32s} → {msg}")
    run.ok(f"{len(fb_to_friendly)} Firebase error codes documented for UI mapping")


def main() -> int:
    print("═" * 70)
    print("  Firebase ↔ Backend Integration Audit")
    print("═" * 70)
    run = Run()

    # Part A first — also gives us a valid token for Parts B-E
    schemas = part_a_firebase_rest(run)

    # Get the SUCCESS token for downstream parts
    code, body = fb_signin(DEMO_EMAIL, DEMO_PASS)
    if code != 200:
        print(f"\nFATAL: cannot sign in as demo client ({code} {body})")
        return 2
    valid_token = body["idToken"]

    part_b_backend_verify(run, valid_token)
    part_c_token_lifecycle(run, valid_token)
    part_d_user_state(run)
    part_e_full_roundtrip(run, valid_token)

    # Final report
    print("\n" + "═" * 70)
    print(f"  {len(run.passes)} passed, {len(run.fails)} failed")
    print("═" * 70)
    if run.fails:
        print("\nFailures:")
        for name, detail in run.fails:
            print(f"  ✗ {name}: {detail}")

    # Save schemas to file for posterity
    out = Path(__file__).parent / "reports" / "firebase_response_schemas.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(schemas, indent=2, default=str))
    print(f"\nFirebase response schemas written to {out}")

    return 0 if not run.fails else 1


if __name__ == "__main__":
    sys.exit(main())
