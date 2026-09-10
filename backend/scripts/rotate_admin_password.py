"""Rotate the main admin's Firebase password.

Usage:
    cd backend && source .venv/bin/activate
    python scripts/rotate_admin_password.py                # generates a random pw
    python scripts/rotate_admin_password.py --new-password '...'  # explicit

Why this script exists:
  The default provisioning password `ChangeMeOnFirstLogin!` has been sitting
  in chat transcripts, LIVE_CREDENTIALS.local.txt, and (briefly) commit
  messages long enough that we can't treat it as private anymore. Rotating
  is a 30-second job - do it before the first paying client onboards.

It:
  1. Looks up the admin Firebase user by ADMIN_EMAIL.
  2. Calls fb_auth.update_user with the new password.
  3. Revokes all outstanding refresh tokens (belt and suspenders - old
     sessions must re-authenticate immediately).
  4. Prints the new credentials so you can paste them into
     LIVE_CREDENTIALS.local.txt manually (NOT auto-written; that file is
     the source of truth and I don't want a scripted rewrite to lose
     comments or non-admin creds).
"""
from __future__ import annotations

import argparse
import secrets
import string
import sys

from firebase_admin import auth as fb_auth

from app.core.security import init_firebase

ADMIN_EMAIL = "admin@insightfusionanalytics.com"


def _generate_password(length: int = 20) -> str:
    """Random URL-safe-ish password without ambiguous chars (0/O/1/l/I)."""
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    # Drop the visually-ambiguous set so if someone has to type it once
    # they don't waste 30s deciding "was that a zero or an O".
    alphabet = "".join(c for c in alphabet if c not in "0O1lI")
    return "".join(secrets.choice(alphabet) for _ in range(length))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--email", default=ADMIN_EMAIL)
    parser.add_argument(
        "--new-password",
        default=None,
        help="If unset, a strong random password is generated.",
    )
    args = parser.parse_args()

    init_firebase()

    new_password = args.new_password or _generate_password()
    if len(new_password) < 12:
        print("Refusing to set a password shorter than 12 chars", file=sys.stderr)
        sys.exit(1)

    try:
        user = fb_auth.get_user_by_email(args.email)
    except fb_auth.UserNotFoundError:
        print(f"Firebase user {args.email!r} not found. Nothing to rotate.", file=sys.stderr)
        sys.exit(1)

    fb_auth.update_user(user.uid, password=new_password)
    fb_auth.revoke_refresh_tokens(user.uid)

    print("=" * 60)
    print("ADMIN PASSWORD ROTATED")
    print("=" * 60)
    print(f"  email:    {args.email}")
    print(f"  password: {new_password}")
    print(f"  uid:      {user.uid}")
    print()
    print("→ Paste into LIVE_CREDENTIALS.local.txt (gitignored).")
    print("→ All existing admin sessions have been revoked.")
    print("=" * 60)


if __name__ == "__main__":
    main()
