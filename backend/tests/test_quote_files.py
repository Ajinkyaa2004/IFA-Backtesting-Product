"""Integration tests for quotes: proposal files (revisions, visibility, tenant
isolation, and the row locks that stop a client accepting a proposal revision
they have not seen) and the USD-default currency.

Real Postgres, real routes, local file storage in a temp dir. Only auth is
swapped: current_user reads an X-Test-User header instead of verifying a
Firebase token.

These tests WRITE rows (clients, users, quotes) and never clean up, so they
refuse to run unless both are true:
  * DATABASE_URL_SYNC points at a local Postgres (localhost / 127.0.0.1), and
  * STORAGE_BACKEND=local  (otherwise files would go to the real bucket).

Run against a throwaway database that has been migrated to head:

    createdb ifa_test && DATABASE_URL_SYNC=postgresql+psycopg2://localhost/ifa_test \
      STORAGE_BACKEND=local alembic upgrade head
    DATABASE_URL_SYNC=postgresql+psycopg2://localhost/ifa_test STORAGE_BACKEND=local \
      pytest tests/test_quote_files.py
"""
import hashlib
import tempfile
import threading
import urllib.parse
import uuid
from pathlib import Path
from urllib.parse import urlparse

import pytest

try:
    from app.core.config import get_settings

    _settings = get_settings()
    _host = urlparse(_settings.DATABASE_URL_SYNC.replace("+psycopg2", "")).hostname
    _local_db = _host in ("localhost", "127.0.0.1", "::1")
    _local_storage = (_settings.STORAGE_BACKEND or "").lower() == "local"
except Exception:  # settings not configured on this machine
    _local_db = _local_storage = False
if not (_local_db and _local_storage):
    pytest.skip(
        "quote_files integration tests need a LOCAL Postgres and STORAGE_BACKEND=local "
        "(see module docstring); refusing to write to a real database or bucket",
        allow_module_level=True,
    )

from fastapi import Depends, Header  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402
from sqlalchemy.exc import IntegrityError  # noqa: E402

import app.services.local_storage as local_storage  # noqa: E402

local_storage._BASE_DIR = Path(tempfile.mkdtemp(prefix="ifa-quote-files-"))

from app.core.deps import current_user  # noqa: E402
from app.db.models import AuditLog, Client, Notification, Quote, QuoteFile, User  # noqa: E402
from app.db.session import SessionLocal, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.services import storage  # noqa: E402


def _fake_current_user(x_test_user: str = Header(...), db=Depends(get_db)):
    return db.query(User).filter(User.id == uuid.UUID(x_test_user)).one()


app.dependency_overrides[current_user] = _fake_current_user

PDF = b"%PDF-1.4\n%fake proposal body\n"


def pdf(tag: str = "v1", extra: int = 0) -> bytes:
    return PDF + tag.encode() + b"x" * extra


@pytest.fixture(scope="module")
def world():
    db = SessionLocal()
    sfx = uuid.uuid4().hex[:8]
    ca = Client(name=f"Client A {sfx}", tier="tier2", status="active")
    cb = Client(name=f"Client B {sfx}", tier="tier2", status="active")
    db.add_all([ca, cb])
    db.flush()

    def mk(role, email, client=None):
        u = User(firebase_uid=f"fb-{uuid.uuid4().hex}", email=email, role=role,
                 status="active", client_id=client.id if client else None,
                 signup_status="approved")
        db.add(u)
        db.flush()
        return u

    w = {
        "ca": ca, "cb": cb,
        "admin": mk("main_admin", f"admin-{sfx}@t.io"),
        "sub": mk("sub_admin", f"sub-{sfx}@t.io"),
        "ua": mk("client", f"a-{sfx}@t.io", ca),
        "ub": mk("client", f"b-{sfx}@t.io", cb),
    }
    db.commit()
    ids = {k: str(v.id) for k, v in w.items()}
    db.close()
    return ids


def H(world, who):
    return {"X-Test-User": world[who]}


@pytest.fixture()
def http():
    return TestClient(app)


def new_quote(http, world, title="EMA/RSI backtest", client="ca", **extra) -> dict:
    r = http.post(f"/api/v1/admin/clients/{world[client]}/quotes", headers=H(world, "admin"),
                  json={"title": title, "amount_inr": 5000000, "description": "scope", **extra})
    assert r.status_code == 201, r.text
    return r.json()


def upload(http, world, qid, data=None, name="Proposal.pdf", note=None, who="admin"):
    files = {"file": (name, data if data is not None else pdf(), "application/octet-stream")}
    return http.post(f"/api/v1/admin/quotes/{qid}/files", headers=H(world, who),
                     files=files, data={"note": note} if note is not None else {})


def send(http, world, qid):
    r = http.post(f"/api/v1/admin/quotes/{qid}/send", headers=H(world, "admin"))
    assert r.status_code == 200, r.text
    return r.json()


def client_quotes(http, world, who="ua"):
    r = http.get("/api/v1/quotes", headers=H(world, who))
    assert r.status_code == 200, r.text
    return {q["id"]: q for q in r.json()}


def fetch_via_signed_url(http, signed_url: str) -> bytes:
    u = urllib.parse.urlparse(signed_url)
    r = http.get(f"{u.path}?{u.query}")
    assert r.status_code == 200, r.text
    return r.content


def db_files(qid):
    db = SessionLocal()
    try:
        return db.query(QuoteFile).filter(QuoteFile.quote_id == uuid.UUID(qid)).all()
    finally:
        db.close()


def storage_exists(key) -> bool:
    try:
        storage.download_bytes(key)
        return True
    except Exception:
        return False


# ── lifecycle ───────────────────────────────────────────────────────────────

def test_draft_upload_is_internal_working_copy(http, world):
    q = new_quote(http, world)
    assert q["files"] == []
    r = upload(http, world, q["id"], name="Draft one.pdf")
    assert r.status_code == 201, r.text
    f = r.json()
    assert f["revision"] is None and f["is_working_copy"] is True and f["sent_at"] is None
    assert f["filename"] == "Draft_one.pdf"
    assert f["mime_type"] == "application/pdf"
    assert f["checksum"] == hashlib.sha256(pdf()).hexdigest()
    assert f["uploaded_by_email"].startswith("admin-")
    # Client cannot see the draft quote at all, nor download its file.
    assert q["id"] not in client_quotes(http, world)
    r = http.get(f"/api/v1/quotes/{q['id']}/files/{f['id']}/download-url", headers=H(world, "ua"))
    assert r.status_code == 404


def test_replacing_working_copy_keeps_exactly_one_and_cleans_storage(http, world):
    q = new_quote(http, world)
    f1 = upload(http, world, q["id"], pdf("one"), "a.pdf").json()
    key1 = next(f.storage_key for f in db_files(q["id"]))
    assert storage_exists(key1)
    f2 = upload(http, world, q["id"], pdf("two"), "b.pdf").json()
    rows = db_files(q["id"])
    assert len(rows) == 1 and str(rows[0].id) == f2["id"] and f1["id"] != f2["id"]
    assert not storage_exists(key1), "old working-copy object should be deleted"
    assert storage_exists(rows[0].storage_key)


def test_send_publishes_working_copy_as_revision_1(http, world):
    q = new_quote(http, world)
    upload(http, world, q["id"], pdf("one"), "Proposal.pdf", note="first cut")
    sent = send(http, world, q["id"])
    assert [(f["revision"], f["is_working_copy"]) for f in sent["files"]] == [(1, False)]
    assert sent["files"][0]["sent_at"] is not None
    cq = client_quotes(http, world)[q["id"]]
    assert [f["revision"] for f in cq["files"]] == [1]
    assert cq["files"][0]["note"] == "first cut"
    # client can download and gets the exact bytes
    r = http.get(f"/api/v1/quotes/{q['id']}/files/{cq['files'][0]['id']}/download-url", headers=H(world, "ua"))
    assert r.status_code == 200
    assert fetch_via_signed_url(http, r.json()["signed_url"]) == pdf("one")


def test_revisions_on_sent_quote_are_numbered_notify_and_all_downloadable(http, world):
    q = new_quote(http, world)
    upload(http, world, q["id"], pdf("one"))
    send(http, world, q["id"])
    r2 = upload(http, world, q["id"], pdf("two"), "Proposal v2.pdf", note="Lowered the fee")
    r3 = upload(http, world, q["id"], pdf("three"), "Proposal v3.pdf")
    assert (r2.status_code, r3.status_code) == (201, 201)
    assert r2.json()["revision"] == 2 and r3.json()["revision"] == 3
    assert r2.json()["is_working_copy"] is False and r2.json()["sent_at"]

    cq = client_quotes(http, world)[q["id"]]
    assert [f["revision"] for f in cq["files"]] == [3, 2, 1]  # newest first
    bodies = {}
    for f in cq["files"]:
        d = http.get(f"/api/v1/quotes/{q['id']}/files/{f['id']}/download-url", headers=H(world, "ua")).json()
        bodies[f["revision"]] = fetch_via_signed_url(http, d["signed_url"])
    assert bodies == {1: pdf("one"), 2: pdf("two"), 3: pdf("three")}  # history intact

    db = SessionLocal()
    try:
        notes = db.query(Notification).filter(
            Notification.recipient_user_id == uuid.UUID(world["ua"]), Notification.kind == "quote",
            Notification.payload["quote_id"].astext == q["id"]).all()
        titles = sorted(n.title for n in notes)
        assert any("revision 2" in t for t in titles) and any("revision 3" in t for t in titles)
        rev2 = next(n for n in notes if "revision 2" in n.title)
        assert "Lowered the fee" in rev2.body
    finally:
        db.close()


def test_stale_accept_is_refused_then_current_accept_succeeds(http, world):
    q = new_quote(http, world)
    upload(http, world, q["id"], pdf("one"))
    send(http, world, q["id"])
    upload(http, world, q["id"], pdf("two"))  # client is still looking at rev 1
    r = http.post(f"/api/v1/quotes/{q['id']}/accept", headers=H(world, "ua"), json={"revision": 1})
    assert r.status_code == 409 and "updated" in r.json()["detail"]
    assert client_quotes(http, world)[q["id"]]["status"] == "sent"
    r = http.post(f"/api/v1/quotes/{q['id']}/accept", headers=H(world, "ua"), json={"revision": 2})
    assert r.status_code == 200 and r.json()["status"] == "accepted"
    assert [f["revision"] for f in r.json()["files"]] == [2, 1]
    db = SessionLocal()
    try:
        a = db.query(AuditLog).filter(AuditLog.action == "quote.accept",
                                      AuditLog.target_id == uuid.UUID(q["id"])).one()
        assert a.payload["accepted_revision"] == 2
    finally:
        db.close()


def test_files_frozen_after_terminal_states(http, world):
    for outcome in ("accept", "reject"):
        q = new_quote(http, world)
        upload(http, world, q["id"])
        send(http, world, q["id"])
        r = http.post(f"/api/v1/quotes/{q['id']}/{outcome}", headers=H(world, "ua"),
                      json={"revision": 1} if outcome == "accept" else {})
        assert r.status_code == 200, r.text
        r = upload(http, world, q["id"], pdf("late"))
        assert r.status_code == 409 and "frozen" in r.json()["detail"]
        assert len(db_files(q["id"])) == 1
        # accepted / rejected quote's proposal stays downloadable by the client
        f = client_quotes(http, world)[q["id"]]["files"][0]
        assert http.get(f"/api/v1/quotes/{q['id']}/files/{f['id']}/download-url",
                        headers=H(world, "ua")).status_code == 200


def test_accept_without_body_still_works_and_no_file_quote_is_fine(http, world):
    q = new_quote(http, world)
    sent = send(http, world, q["id"])
    assert sent["files"] == []
    r = http.post(f"/api/v1/quotes/{q['id']}/accept", headers=H(world, "ua"))  # legacy: no body
    assert r.status_code == 200 and r.json()["status"] == "accepted" and r.json()["files"] == []
    # revision=0 means "I saw no file"
    q2 = new_quote(http, world)
    send(http, world, q2["id"])
    r = http.post(f"/api/v1/quotes/{q2['id']}/accept", headers=H(world, "ua"), json={"revision": 0})
    assert r.status_code == 200


def test_accept_with_revision_0_refused_if_file_appeared(http, world):
    q = new_quote(http, world)
    send(http, world, q["id"])
    upload(http, world, q["id"], pdf("late-arrival"))
    r = http.post(f"/api/v1/quotes/{q['id']}/accept", headers=H(world, "ua"), json={"revision": 0})
    assert r.status_code == 409


def test_patch_status_sent_also_publishes_working_copy(http, world):
    q = new_quote(http, world)
    upload(http, world, q["id"])
    r = http.patch(f"/api/v1/admin/quotes/{q['id']}", headers=H(world, "admin"), json={"status": "sent"})
    assert r.status_code == 200, r.text
    assert [f["revision"] for f in r.json()["files"]] == [1]
    assert [f["revision"] for f in client_quotes(http, world)[q["id"]]["files"]] == [1]


def test_admin_list_shows_working_copy_and_history(http, world):
    q = new_quote(http, world)
    upload(http, world, q["id"], pdf("one"))
    send(http, world, q["id"])
    upload(http, world, q["id"], pdf("two"))
    rows = http.get(f"/api/v1/admin/clients/{world['ca']}/quotes", headers=H(world, "sub")).json()
    mine = next(r for r in rows if r["id"] == q["id"])
    assert [f["revision"] for f in mine["files"]] == [2, 1]
    assert all(f["uploaded_by_email"] for f in mine["files"])


# ── validation ──────────────────────────────────────────────────────────────

@pytest.mark.parametrize("name,data,code", [
    ("evil.exe", b"MZ\x90\x00", 415),
    ("noext", pdf(), 415),
    ("fake.pdf", b"MZ\x90\x00 not a pdf", 415),
    ("fake.docx", pdf(), 415),
    ("empty.pdf", b"", 400),
    (".hidden.pdf", pdf(), 400),
])
def test_rejects_bad_files(http, world, name, data, code):
    q = new_quote(http, world)
    r = upload(http, world, q["id"], data, name)
    assert r.status_code == code, (name, r.status_code, r.text)
    assert db_files(q["id"]) == []


def test_size_limit_413(http, world):
    q = new_quote(http, world)
    r = upload(http, world, q["id"], pdf(extra=25 * 1024 * 1024), "big.pdf")
    assert r.status_code == 413
    assert db_files(q["id"]) == []


def test_accepts_office_formats_and_sanitises_names(http, world):
    q = new_quote(http, world)
    cases = [("Deck.PPTX", b"PK\x03\x04zz"), ("Fees.xlsx", b"PK\x03\x04zz"),
             ("old.doc", b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1zz"), ("readme.txt", b"hello proposal")]
    for name, data in cases:
        assert upload(http, world, q["id"], data, name).status_code == 201, name
    r = upload(http, world, q["id"], pdf(), "../../etc/pass wd (final).pdf")
    assert r.status_code == 201 and r.json()["filename"] == "pass_wd_final.pdf"
    key = db_files(q["id"])[0].storage_key
    assert ".." not in key


def test_note_too_long_400(http, world):
    q = new_quote(http, world)
    assert upload(http, world, q["id"], note="x" * 1001).status_code == 400
    assert upload(http, world, q["id"], note="   ").json()["note"] is None


# ── authorization / isolation ───────────────────────────────────────────────

def test_only_main_admin_uploads_and_clients_cannot(http, world):
    q = new_quote(http, world)
    assert upload(http, world, q["id"], who="sub").status_code == 403
    assert upload(http, world, q["id"], who="ua").status_code == 403
    assert db_files(q["id"]) == []
    assert upload(http, world, str(uuid.uuid4())).status_code == 404


def test_admin_download_both_roles_client_forbidden(http, world):
    q = new_quote(http, world)
    f = upload(http, world, q["id"]).json()
    url = f"/api/v1/admin/quote-files/{f['id']}/download-url"
    for who in ("admin", "sub"):
        r = http.get(url, headers=H(world, who))
        assert r.status_code == 200
        assert fetch_via_signed_url(http, r.json()["signed_url"]) == pdf()
    assert http.get(url, headers=H(world, "ua")).status_code == 403
    assert http.get(f"/api/v1/admin/quote-files/{uuid.uuid4()}/download-url", headers=H(world, "admin")).status_code == 404


def test_cross_tenant_isolation(http, world):
    q = new_quote(http, world, client="ca")
    upload(http, world, q["id"])
    send(http, world, q["id"])
    f = client_quotes(http, world, "ua")[q["id"]]["files"][0]
    assert q["id"] not in client_quotes(http, world, "ub")
    r = http.get(f"/api/v1/quotes/{q['id']}/files/{f['id']}/download-url", headers=H(world, "ub"))
    assert r.status_code == 404
    r = http.post(f"/api/v1/quotes/{q['id']}/accept", headers=H(world, "ub"), json={"revision": 1})
    assert r.status_code == 404


def test_file_id_from_other_quote_is_not_downloadable_via_this_quote(http, world):
    q1, q2 = new_quote(http, world), new_quote(http, world)
    for q in (q1, q2):
        upload(http, world, q["id"])
        send(http, world, q["id"])
    f2 = client_quotes(http, world)[q2["id"]]["files"][0]
    r = http.get(f"/api/v1/quotes/{q1['id']}/files/{f2['id']}/download-url", headers=H(world, "ua"))
    assert r.status_code == 404


def test_unsent_working_copy_hidden_even_on_a_sent_quote(http, world):
    """Defence in depth: force a working copy onto a sent quote (should not happen
    via the API) and confirm the client still can't see or fetch it."""
    q = new_quote(http, world)
    upload(http, world, q["id"], pdf("one"))
    send(http, world, q["id"])
    db = SessionLocal()
    wc = QuoteFile(quote_id=uuid.UUID(q["id"]), revision=None, filename="secret.pdf",
                   mime_type="application/pdf", size_bytes=1, checksum="0" * 64,
                   storage_key="clients/x/secret.pdf", sent_at=None)
    db.add(wc)
    db.commit()
    wid = str(wc.id)
    db.close()
    cq = client_quotes(http, world)[q["id"]]
    assert [f["revision"] for f in cq["files"]] == [1]
    r = http.get(f"/api/v1/quotes/{q['id']}/files/{wid}/download-url", headers=H(world, "ua"))
    assert r.status_code == 404


# ── DB invariants ───────────────────────────────────────────────────────────

def test_db_constraints(world, http):
    q = new_quote(http, world)
    base = dict(quote_id=uuid.UUID(q["id"]), filename="a.pdf", mime_type="application/pdf",
                size_bytes=1, checksum="0" * 64, storage_key="k")
    for bad in (
        [QuoteFile(**base, revision=None), QuoteFile(**base, revision=None)],            # two working copies
        [QuoteFile(**base, revision=1, sent_at=None)],                                   # revision without sent_at
        [QuoteFile(**base, revision=None, sent_at=text("now()"))],                       # sent_at without revision
        [QuoteFile(**base, revision=0, sent_at=text("now()"))],                          # revision < 1
        [QuoteFile(**base, revision=1, sent_at=text("now()")),
         QuoteFile(**base, revision=1, sent_at=text("now()"))],                          # duplicate revision
    ):
        db = SessionLocal()
        with pytest.raises(IntegrityError):
            db.add_all(bad)
            db.commit()
        db.rollback()
        db.close()


# ── failure handling ────────────────────────────────────────────────────────

def test_storage_failure_returns_502_and_leaves_no_row(http, world, monkeypatch):
    q = new_quote(http, world)
    monkeypatch.setattr(storage, "upload_bytes", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("s3 down")))
    r = upload(http, world, q["id"])
    assert r.status_code == 502
    assert db_files(q["id"]) == []


def test_db_failure_after_storage_write_deletes_new_object(world, monkeypatch):
    http = TestClient(app, raise_server_exceptions=False)
    q = new_quote(http, world)
    seen = []
    real_upload = storage.upload_bytes
    monkeypatch.setattr(storage, "upload_bytes", lambda p, *a, **k: (seen.append(p), real_upload(p, *a, **k))[1])
    import app.api.v1.admin.quote_files as mod
    monkeypatch.setattr(mod.audit, "record", lambda *a, **k: (_ for _ in ()).throw(RuntimeError("audit boom")))
    r = upload(http, world, q["id"])
    assert r.status_code == 500
    assert db_files(q["id"]) == []
    assert len(seen) == 1 and not storage_exists(seen[0]), "orphan object must be cleaned up"


# ── concurrency ─────────────────────────────────────────────────────────────

def test_parallel_uploads_get_distinct_contiguous_revisions(world):
    setup = TestClient(app)
    q = new_quote(setup, world)
    upload(setup, world, q["id"], pdf("one"))
    send(setup, world, q["id"])
    results = []

    def go(i):
        c = TestClient(app)
        results.append(upload(c, world, q["id"], pdf(f"p{i}"), f"p{i}.pdf"))

    ts = [threading.Thread(target=go, args=(i,)) for i in range(6)]
    [t.start() for t in ts]
    [t.join() for t in ts]
    assert [r.status_code for r in results] == [201] * 6, [r.text for r in results]
    revs = sorted(f.revision for f in db_files(q["id"]))
    assert revs == list(range(1, 8))


def test_accept_racing_an_upload_never_accepts_an_unseen_revision(world):
    """Client accepts revision 1 while admin uploads revision 2. Whichever wins,
    the two must never both succeed."""
    outcomes = set()
    for _ in range(12):
        setup = TestClient(app)
        q = new_quote(setup, world)
        upload(setup, world, q["id"], pdf("one"))
        send(setup, world, q["id"])
        res = {}
        barrier = threading.Barrier(2)

        def do_accept():
            c = TestClient(app)
            barrier.wait()
            res["accept"] = c.post(f"/api/v1/quotes/{q['id']}/accept", headers=H(world, "ua"), json={"revision": 1})

        def do_upload():
            c = TestClient(app)
            barrier.wait()
            res["upload"] = upload(c, world, q["id"], pdf("two"))

        ts = [threading.Thread(target=do_accept), threading.Thread(target=do_upload)]
        [t.start() for t in ts]
        [t.join() for t in ts]
        a, u = res["accept"].status_code, res["upload"].status_code
        assert (a, u) in {(200, 409), (409, 201)}, (a, u, res["accept"].text, res["upload"].text)
        outcomes.add((a, u))
        # invariant on stored data
        db = SessionLocal()
        try:
            qq = db.get(Quote, uuid.UUID(q["id"]))
            latest = max(f.revision for f in db_files(q["id"]) if f.revision)
            if qq.status == "accepted":
                assert latest == 1
        finally:
            db.close()
    print("race outcomes seen:", outcomes)


# ── currency ────────────────────────────────────────────────────────────────

def test_currency_defaults_to_usd_and_reaches_the_client(http, world):
    q = new_quote(http, world)  # no currency in the request
    assert q["currency"] == "USD" and q["amount_inr"] == 5000000
    send(http, world, q["id"])
    cq = client_quotes(http, world)[q["id"]]
    assert cq["currency"] == "USD" and cq["amount_inr"] == 5000000


def test_inr_is_still_selectable(http, world):
    q = new_quote(http, world, currency="INR")
    assert q["currency"] == "INR"
    send(http, world, q["id"])
    assert client_quotes(http, world)[q["id"]]["currency"] == "INR"


@pytest.mark.parametrize("bad", ["EUR", "usd", "", "US", None])
def test_unsupported_currency_is_rejected(http, world, bad):
    r = http.post(f"/api/v1/admin/clients/{world['ca']}/quotes", headers=H(world, "admin"),
                  json={"title": "Bad currency", "amount_inr": 100, "currency": bad})
    assert r.status_code == 422, (bad, r.status_code, r.text)


def test_patch_cannot_change_currency(http, world):
    q = new_quote(http, world)
    r = http.patch(f"/api/v1/admin/quotes/{q['id']}", headers=H(world, "admin"),
                   json={"currency": "INR", "title": "Renamed quote"})
    assert r.status_code == 200 and r.json()["title"] == "Renamed quote"
    assert r.json()["currency"] == "USD"  # silently ignored, never changes after creation


def test_audit_records_the_currency_for_create_send_accept(http, world):
    q = new_quote(http, world, currency="INR")
    send(http, world, q["id"])
    assert http.post(f"/api/v1/quotes/{q['id']}/accept", headers=H(world, "ua")).status_code == 200
    db = SessionLocal()
    try:
        rows = db.query(AuditLog).filter(
            AuditLog.target_id == uuid.UUID(q["id"]),
            AuditLog.action.in_(["quote.create", "quote.send", "quote.accept"])).all()
        assert {r.action for r in rows} == {"quote.create", "quote.send", "quote.accept"}
        assert all(r.payload["currency"] == "INR" and r.payload["amount_inr"] == 5000000 for r in rows)
    finally:
        db.close()


def test_db_defaults_to_usd_and_rejects_other_currencies(world, http):
    cid = uuid.UUID(world["ca"])
    db = SessionLocal()
    try:
        db.execute(text("insert into quotes (code, client_id, title, amount_inr) "
                        "values (:c, :cid, 'raw insert', 100)"), {"c": f"QT-RAW-{uuid.uuid4().hex[:6]}", "cid": cid})
        db.commit()
        assert db.execute(text("select currency from quotes where title = 'raw insert' "
                               "order by created_at desc limit 1")).scalar() == "USD"
        with pytest.raises(IntegrityError):
            db.execute(text("insert into quotes (code, client_id, title, amount_inr, currency) "
                            "values (:c, :cid, 'eur', 1, 'EUR')"), {"c": f"QT-EUR-{uuid.uuid4().hex[:6]}", "cid": cid})
            db.commit()
    finally:
        db.rollback()
        db.close()
