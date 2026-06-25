from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from app.api.v1 import api_router
from app.core.config import get_settings
from app.core.security import init_firebase

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    logger.info("Starting {} ({})", settings.APP_NAME, settings.APP_ENV)
    init_firebase()
    yield
    logger.info("Shutting down")


# Hide auto-generated docs outside of local/dev to reduce surface area in prod.
_DOCS_URL = "/docs" if settings.APP_ENV in ("local", "dev") else None
_REDOC_URL = "/redoc" if settings.APP_ENV in ("local", "dev") else None
_OPENAPI_URL = "/openapi.json" if settings.APP_ENV in ("local", "dev") else None

app = FastAPI(
    title="IFA Backtest Product",
    version="0.1.0",
    docs_url=_DOCS_URL,
    redoc_url=_REDOC_URL,
    openapi_url=_OPENAPI_URL,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _cors_headers_for(request: Request) -> dict[str, str]:
    """Compute the CORS response headers manually for a given request.

    FastAPI's CORSMiddleware does not always wrap responses from the
    @app.exception_handler(Exception) catch-all — depending on where in the
    stack the exception is raised (e.g. inside a dependency or database driver
    via SQLAlchemy), the 500 response can bypass the middleware entirely. When
    that happens, the browser sees a 500 with no Access-Control-Allow-Origin
    header and reports it as a misleading "CORS policy" error instead of the
    real underlying problem. That cost us hours of debugging once — never again.
    """
    origin = request.headers.get("origin")
    if origin and origin in settings.allowed_origins_list:
        return {
            "Access-Control-Allow-Origin": origin,
            "Access-Control-Allow-Credentials": "true",
            "Vary": "Origin",
        }
    return {}


@app.exception_handler(Exception)
async def _unhandled_exception(request: Request, exc: Exception):
    """Catch-all so a server bug never leaks a stack trace to the client.
    The traceback is still logged. CORS headers are added manually so the
    browser surfaces the actual 500, not a confusing CORS error."""
    logger.exception("Unhandled exception on {} {}", request.method, request.url.path)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal server error"},
        headers=_cors_headers_for(request),
    )


app.include_router(api_router, prefix=settings.API_PREFIX)


@app.get("/healthz")
def healthz():
    return {"ok": True, "service": settings.APP_NAME, "env": settings.APP_ENV}
