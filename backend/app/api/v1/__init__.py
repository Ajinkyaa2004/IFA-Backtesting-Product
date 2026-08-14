from fastapi import APIRouter

from app.api.v1 import auth, backtests, content, engagement, local_storage, me, notifications, quotes, requests, services, strategies, terms, vam
from app.api.v1.admin import admin_router
from app.core.config import get_settings

api_router = APIRouter()
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(me.router, tags=["me"])
api_router.include_router(terms.router, tags=["terms"])
api_router.include_router(strategies.router, tags=["strategies"])
api_router.include_router(requests.router, tags=["requests"])
api_router.include_router(backtests.router, tags=["backtests"])
api_router.include_router(notifications.router, tags=["notifications"])
api_router.include_router(content.router, tags=["content"])
api_router.include_router(engagement.router, tags=["engagement"])
api_router.include_router(services.router, tags=["services"])
api_router.include_router(quotes.router, tags=["quotes"])
api_router.include_router(vam.router)
api_router.include_router(admin_router)

# Local-mode storage route only exists when the env says so. Keeps the URL
# space empty in production so probing /api/v1/local-storage/... 404s cleanly.
if (get_settings().STORAGE_BACKEND or "supabase").lower() == "local":
    api_router.include_router(local_storage.router, tags=["local-storage"])
