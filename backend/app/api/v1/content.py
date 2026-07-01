"""Public content endpoint — the client reads UI copy from here on every
dashboard load. No authentication required so the login screen etc. can
also read customized copy in future.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.services import content

router = APIRouter()


@router.get("/content")
def get_content(db: Session = Depends(get_db)):
    """Return the fully-merged content dict.

    Frontend Zustand store hydrates from this response on app boot. Cheap
    query (up to ~8 rows) so we don't bother with caching for MVP; add
    Redis / edge cache once we see p95 > 100ms.
    """
    return content.get_all_content(db)
