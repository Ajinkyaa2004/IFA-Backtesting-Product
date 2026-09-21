"""One-shot cleanup — remove every demo/test client + user from the DB,
Firebase Auth, and local file storage. Real client data + admin are
preserved via an explicit keep-list. Idempotent: safe to re-run.

Run inside the backend container:
  sudo docker compose --env-file .env.production \
    -f docker-compose.prod.yml -f docker-compose.override.yml \
    run --rm --workdir /app/backend backend python -m cleanup_demo_data
"""

from __future__ import annotations

import shutil
from pathlib import Path

from firebase_admin import auth as fb_auth
from firebase_admin.exceptions import FirebaseError
from sqlalchemy import delete, or_, text
from sqlalchemy.orm import Session

from app.core.security import init_firebase
from app.db.models import Client, User
from app.db.session import SessionLocal

# ── Keep list — every other client + user gets deleted ────────────────
KEEP_EMAILS = frozenset({
    "insightfusionanalytics@gmail.com",  # admin
    "ravi@ifa.com",                       # real VAM client
    "anmolpathak222@gmail.com",           # Anmol's personal
})

STORAGE_ROOT = Path("/app/backend/storage-local/clients")


def main() -> None:
    init_firebase()

    with SessionLocal() as db:  # type: Session
        # 1. Find every user we'll remove — either explicitly not in the
        #    keep list OR a stale signup (pending/rejected with no client).
        victims: list[User] = (
            db.query(User)
            .filter(~User.email.in_(KEEP_EMAILS))
            .all()
        )
        # Snapshot the fields we need AFTER the DB delete (SQLAlchemy
        # expires the ORM object and any attribute read raises
        # ObjectDeletedError once the cascade removes the row).
        victims_snapshot = [
            {"email": u.email, "firebase_uid": u.firebase_uid, "id": u.id}
            for u in victims
        ]
        print(f"Users to delete: {len(victims)}")
        for u in victims:
            print(f"  - {u.email} ({u.role}, {u.signup_status})")

        # 2. Find every client whose only surviving user link is in the
        #    victim set — those cascade automatically, but we log for
        #    clarity + collect their id so we can nuke storage after.
        client_ids_to_delete = {u.client_id for u in victims if u.client_id}
        # Also delete client rows whose linked user is already gone (orphans)
        orphan_clients = (
            db.query(Client)
            .filter(~Client.id.in_(
                db.query(User.client_id).filter(
                    User.email.in_(KEEP_EMAILS),
                    User.client_id.isnot(None),
                )
            ))
            .all()
        )
        for c in orphan_clients:
            client_ids_to_delete.add(c.id)
        print(f"Clients to delete: {len(client_ids_to_delete)}")

        # 3. Delete clients first — cascade blows away engagements,
        #    backtests, strategies, requests, quotes, backtest_files.
        for cid in client_ids_to_delete:
            db.execute(delete(Client).where(Client.id == cid))
        db.flush()

        # 4. Delete any remaining orphan users (pending/rejected signups
        #    that never had a client_id). Client-cascade already
        #    handled the ones linked to deleted clients.
        for snap in victims_snapshot:
            db.execute(delete(User).where(User.id == snap["id"]))
        db.commit()

        # 5. Firebase: delete every UID that was on those users. If
        #    Firebase already dropped the user we ignore the miss.
        fb_deleted = 0
        for snap in victims_snapshot:
            try:
                fb_auth.delete_user(snap["firebase_uid"])
                fb_deleted += 1
            except fb_auth.UserNotFoundError:
                pass
            except FirebaseError as e:
                print(f"  Firebase delete failed for {snap['email']}: {e}")
        print(f"Firebase users deleted: {fb_deleted}")

        # 6. Storage: nuke each removed client's on-disk directory.
        removed_dirs = 0
        for cid in client_ids_to_delete:
            dir_path = STORAGE_ROOT / str(cid)
            if dir_path.exists():
                shutil.rmtree(dir_path)
                removed_dirs += 1
        print(f"Storage directories removed: {removed_dirs}")

        # 7. Summary
        print("\n── After cleanup ──")
        for row in db.execute(
            text(
                "SELECT c.name, c.tier, "
                "(SELECT count(*) FROM backtests WHERE client_id=c.id) AS bt, "
                "(SELECT count(*) FROM users WHERE client_id=c.id) AS users "
                "FROM clients c ORDER BY c.created_at"
            )
        ).all():
            print(f"  Client: {row.name} ({row.tier}) — {row.bt} backtests, {row.users} users")
        for row in db.execute(
            text("SELECT email, role, signup_status FROM users ORDER BY created_at")
        ).all():
            print(f"  User:   {row.email} — {row.role}/{row.signup_status}")

        # 8. Also trim the audit log's leftover references — audit_log
        #    is append-only so we DON'T delete it, but we surface the
        #    stale entries so the admin knows the history is preserved.
        stale_audit_ct = db.execute(
            text(
                "SELECT count(*) FROM audit_log WHERE actor_user_id NOT IN "
                "(SELECT id FROM users)"
            )
        ).scalar_one()
        print(f"\nAudit log entries retained (with null actor now): {stale_audit_ct}")


if __name__ == "__main__":
    main()
