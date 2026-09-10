"""Idempotently provision Ravi as a VAM-enabled client.

Run once locally (and once on prod after the migration applies):

    cd backend && source .venv/bin/activate
    python scripts/provision_ravi.py

What it does:
  1. Look up the Firebase user `ravi@ifa.com`. Create it with the given password
     if absent.
  2. Look up the IFA "Ravi" client row in our DB. Create if absent. Set
     vam_enabled=True regardless of how the row got there.
  3. Look up the User row linking Ravi's Firebase UID to that client. Create if
     absent. Role = client.

Safe to re-run - every step is keyed on the email / firebase_uid so it won't
duplicate.

NOTE: this is the same credential pair we use for VAM_ADMIN_EMAIL/PASSWORD
(VAM and our portal happen to share Ravi's identity). The two systems are
otherwise independent.
"""
from __future__ import annotations

from app.core.security import (
    create_firebase_user,
    get_firebase_user_by_email,
    init_firebase,
)
from app.db.models import Client, User
from app.db.session import SessionLocal

RAVI_EMAIL = "ravi@ifa.com"
RAVI_PASSWORD = "Admin@2025"
RAVI_CLIENT_NAME = "Insight Fusion Analytics - Ravi"
RAVI_CLIENT_TIER = "tier3"  # he's effectively the principal - use the top tier


def main() -> None:
    init_firebase()

    # 1. Firebase user
    fb = get_firebase_user_by_email(RAVI_EMAIL)
    if fb is None:
        fb_uid = create_firebase_user(RAVI_EMAIL, RAVI_PASSWORD, display_name="Ravi")
        print(f"[firebase] created user uid={fb_uid}")
    else:
        fb_uid = fb.uid
        print(f"[firebase] user already exists uid={fb_uid}")

    db = SessionLocal()
    try:
        # 2. Find a client row associated with Ravi. We do this by walking from
        # the existing User row (if any) → client_id. Otherwise we look up by name.
        user = db.query(User).filter(User.firebase_uid == fb_uid).first()
        client = None
        if user and user.client_id:
            client = db.query(Client).filter(Client.id == user.client_id).first()
        if client is None:
            client = (
                db.query(Client)
                .filter(Client.name == RAVI_CLIENT_NAME, Client.deleted_at.is_(None))
                .first()
            )

        if client is None:
            client = Client(
                name=RAVI_CLIENT_NAME,
                primary_contact="Ravi",
                tier=RAVI_CLIENT_TIER,
                status="active",
                vam_enabled=True,
            )
            db.add(client)
            db.flush()
            print(f"[db] created client id={client.id} name='{client.name}' vam_enabled=True")
        else:
            if not client.vam_enabled:
                client.vam_enabled = True
                print(f"[db] flipped client {client.id} vam_enabled True")
            else:
                print(f"[db] client {client.id} already vam_enabled")

        # 3. User row linking Firebase ↔ client
        if user is None:
            user = User(
                firebase_uid=fb_uid,
                email=RAVI_EMAIL,
                role="client",
                status="active",
                client_id=client.id,
            )
            db.add(user)
            print(f"[db] created user row for firebase_uid={fb_uid} role=client client_id={client.id}")
        else:
            updated = False
            if user.client_id != client.id:
                user.client_id = client.id
                updated = True
            if user.role != "client":
                user.role = "client"
                updated = True
            if user.status != "active":
                user.status = "active"
                updated = True
            print(f"[db] user row exists id={user.id} (updated={updated})")

        db.commit()
        print()
        print("DONE. Ravi can now log in at /login with:")
        print(f"  email    = {RAVI_EMAIL}")
        print(f"  password = (the value of RAVI_PASSWORD)")
        print(f"  client   = {client.name}  (id={client.id})  vam_enabled={client.vam_enabled}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
