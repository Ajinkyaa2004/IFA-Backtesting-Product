"""Fallback: delete every Firebase Auth user whose email is NOT in the
keep list. Useful when the DB cleanup ran but Firebase Auth entries
were left behind — they can otherwise still authenticate and then
land on the "not provisioned" screen.
"""

from firebase_admin import auth as fb_auth
from firebase_admin.exceptions import FirebaseError

from app.core.security import init_firebase

KEEP_EMAILS = frozenset({
    "insightfusionanalytics@gmail.com",
    "ravi@ifa.com",
    "anmolpathak222@gmail.com",
})


def main() -> None:
    init_firebase()
    deleted = kept = errored = 0
    page = fb_auth.list_users()
    for user in page.iterate_all():
        if user.email and user.email.lower() in KEEP_EMAILS:
            kept += 1
            continue
        try:
            fb_auth.delete_user(user.uid)
            print(f"deleted: {user.email} ({user.uid})")
            deleted += 1
        except FirebaseError as e:
            print(f"error: {user.email} — {e}")
            errored += 1
    print(f"\nSummary: kept={kept}, deleted={deleted}, errored={errored}")


if __name__ == "__main__":
    main()
