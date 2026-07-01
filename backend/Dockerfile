# Production image for the IFA Backtest Product FastAPI backend.
#
# IMPORTANT: build context MUST be the repo root, not backend/.
# We preserve the on-disk layout (backend/app/..., schemas/...) so that the
# Path(__file__).resolve().parents[N] calls in app/core/config.py,
# app/api/v1/admin/backtests.py, etc. resolve correctly inside the container.
#
#   docker build -f backend/Dockerfile -t ifa-backend:latest .
#
# On Render, set:
#   Root Directory: (leave blank — repo root)
#   Dockerfile Path: backend/Dockerfile
#   Docker Build Context Directory: . (repo root)

# ── Stage 1: build deps ────────────────────────────────────────
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /build

RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip && pip install \
    "fastapi>=0.115" "uvicorn[standard]>=0.30" "sqlalchemy>=2.0" "alembic>=1.13" \
    "psycopg2-binary>=2.9" "pydantic>=2.7" "pydantic-settings>=2.4" "python-dotenv>=1.0" \
    "firebase-admin>=6.5" "supabase>=2.7" "loguru>=0.7" "python-multipart>=0.0.9" \
    "httpx>=0.27" "jsonschema>=4.23" "pydantic[email]" \
    "slowapi>=0.1.9" "sentry-sdk[fastapi]>=2.14"

# ── Stage 2: runtime ──────────────────────────────────────────
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
        libpq5 curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --shell /bin/bash app

COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Preserve dev layout so parents[N] path lookups still work:
#   /app/backend/app/...   (mirrors repo/backend/app/...)
#   /app/schemas/...       (mirrors repo/schemas/...)
COPY backend ./backend
COPY schemas ./schemas

RUN chown -R app:app /app
USER app

EXPOSE 8000

# Render injects $PORT — fall back to 8000 for local docker run.
# Use `sh -c` so the env var actually expands.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000} --app-dir /app/backend"]

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
    CMD curl -fsS http://localhost:${PORT:-8000}/healthz || exit 1
