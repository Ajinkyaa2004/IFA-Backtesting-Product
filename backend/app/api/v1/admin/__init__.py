from fastapi import APIRouter

from app.api.v1.admin import audit, backtests, client_requests, clients, content, exports, impersonate, inbox, notifications, stats, strategies, terms, vam

admin_router = APIRouter(prefix="/admin", tags=["admin"])
admin_router.include_router(stats.router)
admin_router.include_router(inbox.router)
admin_router.include_router(clients.router)
admin_router.include_router(client_requests.router)
admin_router.include_router(strategies.router)
admin_router.include_router(backtests.router)
admin_router.include_router(terms.router)
admin_router.include_router(notifications.router)
admin_router.include_router(audit.router)
admin_router.include_router(vam.router)
admin_router.include_router(impersonate.router)
admin_router.include_router(exports.router)
admin_router.include_router(content.router)
