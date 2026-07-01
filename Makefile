# IFA Backtest Engine — dev-experience Makefile
#
# Common targets so a fresh clone doesn't need to hunt around for the right
# uvicorn / vite / test invocations. Everything below runs in the local
# dev environment.

BACKEND := backend
FRONTEND := frontend
PYTHON := $(BACKEND)/.venv/bin/python
UVICORN := $(BACKEND)/.venv/bin/uvicorn
# WeasyPrint needs pango + cairo etc. on macOS — brew ships them under /opt/homebrew.
DYLD := DYLD_LIBRARY_PATH=/opt/homebrew/lib

.PHONY: help dev backend frontend seed seed-reset test test-vam test-smoke lint typecheck tsc-frontend py-import deploy install

help:
	@echo "IFA Backtest Engine — dev targets"
	@echo ""
	@echo "  make install       — install backend deps in .venv + frontend deps"
	@echo "  make dev           — run backend + frontend concurrently"
	@echo "  make backend       — run just the FastAPI backend at :8000"
	@echo "  make frontend      — run just the Vite dev server at :5173"
	@echo "  make seed          — seed default clients + backtests"
	@echo "  make seed-reset    — WIPE backtests/strategies/requests THEN reseed"
	@echo "  make test          — full Selenium suite (91 checks)"
	@echo "  make test-vam      — VAM + polish suite (35 checks)"
	@echo "  make test-smoke    — live deployment smoke (against prod URL)"
	@echo "  make lint          — ruff + eslint"
	@echo "  make typecheck     — mypy + tsc"
	@echo "  make deploy        — push main + redeploy VPS (needs SSH access)"

install:
	cd $(BACKEND) && python3.12 -m venv .venv || true
	$(BACKEND)/.venv/bin/pip install -e $(BACKEND) 2>/dev/null || $(BACKEND)/.venv/bin/pip install \
		fastapi 'uvicorn[standard]' sqlalchemy alembic psycopg2-binary pydantic pydantic-settings \
		python-dotenv firebase-admin supabase loguru python-multipart httpx jsonschema 'pydantic[email]' \
		slowapi 'sentry-sdk[fastapi]' jinja2 weasyprint
	cd $(FRONTEND) && npm install

backend:
	$(DYLD) $(UVICORN) app.main:app --reload --host 127.0.0.1 --port 8000 --app-dir $(BACKEND)

frontend:
	cd $(FRONTEND) && npm run dev

dev:
	@echo "Starting backend + frontend concurrently (Ctrl-C stops both)"
	@$(MAKE) backend & \
		$(MAKE) frontend & \
		wait

seed:
	$(DYLD) $(PYTHON) -m app.seed

seed-reset:
	@echo "⚠️  Wiping local state THEN reseeding — Ctrl-C in 3 seconds to abort"
	@sleep 3
	$(DYLD) $(PYTHON) -m app.seed --reset

test:
	cd $(BACKEND) && $(DYLD) .venv/bin/python -m tests.e2e_selenium

test-vam:
	cd $(BACKEND) && $(DYLD) .venv/bin/python -m tests.e2e_vam_and_polish

test-smoke:
	cd $(BACKEND) && $(DYLD) .venv/bin/python -m tests.e2e_deployment_smoke

lint:
	cd $(BACKEND) && .venv/bin/ruff check app
	cd $(FRONTEND) && npm run lint

typecheck:
	cd $(FRONTEND) && npx tsc -b --noEmit
	cd $(BACKEND) && .venv/bin/python -c "import app.main"

deploy:
	git push origin main
	@echo "Pushed to main. VPS redeploy is manual — run:"
	@echo "  ssh root@168.144.81.2 'cd /opt/ifa-backtest-product && git pull && docker compose -f docker-compose.prod.yml up -d --build'"
