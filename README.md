<div align="center">

# 📊 IFA Backtest Engine

### Client Portal for Systematic Strategy Research — Backtests · Reports · Engagement

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=flat&logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com/)
[![React](https://img.shields.io/badge/React-19.2-61DAFB?style=flat&logo=react&logoColor=black)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=flat&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=flat&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?style=flat&logo=supabase&logoColor=white)](https://supabase.com/)
[![Firebase Auth](https://img.shields.io/badge/Firebase-Auth-FFCA28?style=flat&logo=firebase&logoColor=black)](https://firebase.google.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat&logo=docker&logoColor=white)](https://www.docker.com/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=flat&logo=vite&logoColor=white)](https://vitejs.dev/)

[🎯 Overview](#-overview) • [🚀 Features](#-features) • [📦 Quick Start](#-quick-start) • [🛠️ Tech Stack](#️-tech-stack) • [🏗️ Architecture](#️-architecture) • [🔐 Admin Console](#-admin-console) • [🧪 Testing](#-testing) • [📁 Structure](#-project-structure)

</div>

---

## 🎯 Overview

**IFA Backtest Engine** is the client portal for **Insight Fusion Analytics** — a serviced platform for systematic trading strategy research and delivery in Indian markets. Clients submit strategies, IFA runs versioned backtests on isolation-tested engines, and results land in the client's dashboard with honest reports, audit trails, and PDF exports.

The site is a **FastAPI + React SPA** built on the *"one contract, many engines"* architecture: every client engagement declares its scope, tier, and deliverable up front; every engine is a first-class object with a parameter schema, an isolation gate, and a versioned lifecycle. Admins operate the platform through an in-app console with a **no-code content CMS**, live impersonation, an activity timeline per client, and a strict audit log — every save, every login, every impersonation session is tracked.

### Why this build?

| Capability | Description |
|---|---|
| 📈 **Full backtest workflow** | Client submits strategy → admin uploads results → client sees equity curve, drawdown, KPIs, trade log, PDF export |
| 🔐 **No-code admin CMS** | 7 editable content areas (welcome, tier card, onboarding, placeholder tiles, footer, announcement, section visibility) — saves go live instantly with a client dashboard preview iframe |
| 🎛️ **Engagement primitive** | Every client has one Engagement with scope, tier, engine assignment, deliverable, and versioned scope — scope edits force re-acknowledgement |
| ⚙️ **Engine registry** | Engines are first-class objects with a declared parameter schema and an isolation-pass gate before they can go live in production |
| 📐 **Parameter schema contract** | Schema-driven tuning UI for any engine — types, min/max, enums, safe-AST constraint eval, holdout enforcement |
| 🕹️ **Live impersonation** | Admins sign in as a client with a sticky red banner and full audit trail — every action logged with the impersonation session ID |
| 📄 **PDF reports** | WeasyPrint-rendered backtest reports with performance metrics, disclaimers, and IFA branding |
| 🔗 **VAM engine bridge** | Selenium-driven bridge into the existing VAM strategy runner — clients can trigger, monitor, and receive results without leaving the portal |
| 📱 **Marketing landing** | Public SEO-indexable landing with JSON-LD (Organization, SoftwareApplication, FAQPage), OG cards, sitemap, and PWA manifest |
| 🛡️ **Hardened** | Firebase Auth Admin SDK with role-gate, per-tier rate limits, cross-tenant guards, security-header set (CSP, X-Frame-Options, HSTS), audit log for every write |

**Positioning:** Serviced systematic-research portal — versioned, honest, auditable — *not* a self-serve SaaS.

---

## 📦 Quick Start

```bash
# Clone
git clone https://github.com/Ajinkyaa2004/IFA-Backtesting-Product.git
cd IFA-Backtesting-Product

# Backend
cd backend
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -e .[dev]
cp .env.example .env                 # then fill in Supabase + Firebase values
alembic upgrade head
python -m app.seed                   # optional: seed a demo tenant
uvicorn app.main:app --reload --port 8000

# Frontend (new terminal)
cd frontend
npm install
cp .env.example .env.local           # then fill in VITE_* Firebase values
npm run dev
```

Backend → [http://localhost:8000/docs](http://localhost:8000/docs) 📖
Frontend → [http://localhost:5173](http://localhost:5173) 🎉

> The stack ships with **Docker Compose** too — `docker compose -f docker-compose.prod.yml up` runs backend + frontend + nginx behind an SSL-terminating proxy.

---

## 🎬 Demo

**🌐 Live:** [backtestingengine.insightfusionanalytics.com](https://backtestingengine.insightfusionanalytics.com)

<details>
<summary>📸 Key surfaces (click to expand)</summary>

```
Public:
  /                        Marketing landing — hero, features, tiers, FAQ, book-a-call CTA
  /login                   Client sign-in (Firebase, email+password)
  /admin/login             Admin sign-in (role-gated; clients bounce to /login)
  /terms                   Multi-step T&C acceptance (versioned, click-signed, timestamped)

Client portal (auth-gated):
  /dashboard               Overview — lifecycle stepper, scope panel, KPIs, latest backtests
  /strategies              Strategy versions, upload history, review status
  /requests                Client-to-admin request form + inbox (4 categories)
  /backtests               List with tier filter + status chips
  /backtests/:id           Full result page — equity curve, drawdown, KPIs, trades, PDF export

Admin console (auth-gated):
  /admin                   Pulse — platform stats, needs-attention inbox, wire diagram
  /admin/clients           Client roster + engagement editor + tier + activity timeline drawer
  /admin/engines           Engine registry — status transitions, isolation harness, schema preview
  /admin/backtests/upload  6-step backtest upload wizard with schema validation
  /admin/content           No-code CMS — live iframe preview of the client dashboard
  /admin/terms             T&C version editor with acceptance ledger
  /admin/notifications     Broadcast + per-client message composer
  /admin/audit             Filterable audit log — impersonation, saves, logins, rate-limits
```

</details>

---

## ✨ Features

<table>
<tr>
<td width="50%">

### 📊 Client Dashboard

- Overview page with **lifecycle stepper** (Set-up → Terms signed → Strategy received → Engine ready → First backtest → Tuning unlocked)
- **Scope panel** pinned above the fold — collapsible, re-ack modal when scope version bumps
- Onboarding progress with tier-aware placeholder tiles
- Backtests list with filter chips + latest-first sort
- Backtest detail with recharts equity curve, drawdown, KPIs, trades table, PDF export
- Strategies page with expandable version history
- Requests page with 4-tab form (strategy tweak / benchmark / holding / general)

</td>
<td width="50%">

### 🎛️ Admin Console

- **Pulse dashboard** — platform stats, needs-attention inbox with SLA age pill (green/amber/red vs 1-BD promise), architecture wire diagram, VAM engine health
- **Client roster** with search + pagination, drawer with engagement editor, tier, status, activity timeline
- **Engine registry** — CRUD with isolation-pass gate before `live` status
- **6-step backtest upload wizard** with JSON schema validation
- **Content CMS** with iframe live preview of the client dashboard
- **Impersonation** — sticky red banner, every action logged with session ID
- **Audit log** with impersonation / rate-limit / save filter chips

</td>
</tr>
<tr>
<td width="50%">

### 🧱 "One Contract, Many Engines" Architecture

- **Engagement** as central primitive: scope in/out, tier, engine assignment, deliverable, scope_version
- **Engine** as first-class object with declared parameter schema + isolation-pass timestamp
- **Parameter schema contract** — schema-driven form renderer, safe-AST constraint eval, holdout enforcement
- **Isolation gate** — engine cannot transition to `live` without recorded isolation-pass
- **Two lenses** on client state: account status (permission) vs lifecycle progress (derived)

</td>
<td width="50%">

### 🎨 Motion & Polish

- Route-transition + reveal-on-scroll orchestrated by **framer-motion**
- Off-canvas mobile drawer with hamburger — every page usable at 320px
- Global toast system, dark-mode with persisted preference
- Notification bell with unread count (both sides)
- Symmetric client + admin layouts — same UX language across roles
- Splash-free, motion-friendly, accessibility-aware

</td>
</tr>
<tr>
<td width="50%">

### 🔐 Auth, Rate Limits & Compliance

- **Firebase Admin SDK** verify-token gate on every request
- Role-gated routes (`client`, `sub_admin`, `main_admin`)
- Per-tier + per-endpoint rate limits via **SlowAPI**
- Cross-tenant guards on every client-scoped query
- **Sentry** wired into backend + frontend
- **Audit log** on every mutation, impersonation session, and login
- DPDP-aware T&C flow with versioned click-signed acceptance ledger

</td>
<td width="50%">

### 🔍 SEO & Marketing Surface

- Public landing page at `/` with hero, features, tiers, FAQ, book-a-call CTA
- **JSON-LD** — Organization, SoftwareApplication, FAQPage
- Dynamic `sitemap.xml` + `robots.txt` (allow landing, disallow every gated route)
- `site.webmanifest` for PWA install (Android + iOS home-screen)
- 1200×630 OG image, `summary_large_image` Twitter card
- `<noscript>` fallback for Slack/LinkedIn/WhatsApp link-unfurl bots
- React 19 native metadata hoisting via `<SEOHead />` — per-route title, description, canonical

</td>
</tr>
</table>

---

## 🛠️ Tech Stack

![FastAPI](https://img.shields.io/badge/FastAPI-0.115-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19.2-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Firebase](https://img.shields.io/badge/Firebase-Auth-FFCA28?style=for-the-badge&logo=firebase&logoColor=black)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)

<details>
<summary><b>📋 Complete technology breakdown</b></summary>

### Backend

| Package | Version | Purpose |
|---|---|---|
| **FastAPI** | 0.115+ | HTTP framework — async request handling, OpenAPI docs |
| **SQLAlchemy** | 2.0+ | ORM — 12 declarative models |
| **Alembic** | 1.13+ | Migrations — 8 versioned steps |
| **Pydantic** | 2.7+ | Validation + settings via `pydantic-settings` |
| **firebase-admin** | 6.5+ | Token verification, admin actions |
| **supabase** | 2.7+ | Postgres + Storage buckets for artifacts |
| **SlowAPI** | 0.1.9+ | Per-tier + per-endpoint rate limiting |
| **WeasyPrint** | 62.3+ | HTML → PDF backtest reports |
| **Jinja2** | 3.1+ | Report + email templates |
| **jsonschema** | 4.23+ | Backtest JSON validation against locked v1.0 schema |
| **Selenium** | (bridge) | VAM engine remote-control bridge |
| **Sentry SDK** | 2.14+ | Backend error tracking |
| **Loguru** | 0.7+ | Structured logging |

### Frontend

| Package | Version | Purpose |
|---|---|---|
| **React** | 19.2 | UI library — native metadata hoisting used for SEO |
| **React Router** | 7 | Client routing |
| **TypeScript** | 5 | Type safety |
| **Tailwind CSS** | 3.4 | Utility-first styling |
| **Vite** | 8 | Build + dev server |
| **Zustand** | 5 | State — auth, content, impersonate, toast, sidebar |
| **TanStack Query** | 5 | Server state caching |
| **axios** | 1.16 | HTTP client with bearer-token interceptor |
| **framer-motion** | 12 | Route transitions, reveals, drawer slide-in |
| **recharts** | 3.8 | Equity curve, drawdown charts |
| **lightweight-charts** | 4.1 | Advanced financial charts |
| **react-hook-form** + **zod** | 7.76 / 4.4 | Form state + validation |
| **Firebase JS SDK** | 12 | Auth flow (email + password) |
| **lucide-react** | 1.16 | Icon set |
| **Sentry React SDK** | 8.55 | Frontend error tracking |

### Infrastructure

| Layer | Purpose |
|---|---|
| **Docker + Compose** | Backend, frontend, nginx as a single-command up |
| **nginx** | SSL termination, CSP/HSTS headers, static SPA serving |
| **Let's Encrypt** | Automated cert renewal via certbot |
| **Supabase Postgres** | Primary data store |
| **Supabase Storage** | Strategy artifacts, backtest JSONs, PDF reports |
| **Firebase Auth** | Identity — email+password, admin-managed users |

### Tooling

| Tool | Purpose |
|---|---|
| **pytest** + **Selenium** | End-to-end UI test suite (~155 tests) |
| **ruff** + **black** + **mypy** | Backend lint / format / type-check |
| **ESLint** + **tsc** | Frontend lint / type-check |
| **Alembic** | Schema migrations |
| **Make** | Repeatable ops (`make seed`, `make deploy`, `make test`) |

</details>

---

## 🏗️ Architecture

```mermaid
graph TB
    A[Visitor] -->|HTTPS| B[nginx: SSL + CSP + HSTS]
    B --> C[React SPA]
    B --> D[FastAPI]

    C -->|Bearer token| D
    C -->|SEO landing| Z[Public marketing surface]

    D -->|verify_id_token| E[Firebase Admin]
    D -->|SQLAlchemy| F[(Supabase Postgres)]
    D -->|signed URL| G[(Supabase Storage)]
    D -->|Selenium bridge| H[VAM engine]
    D -->|SlowAPI| I[Per-tier rate limits]
    D -->|WeasyPrint| J[PDF reports]
    D -->|Sentry SDK| K[Sentry]

    L[Admin console] -->|impersonate| C
    L -->|audit log| F

    style B fill:#111,stroke:#7c6cff,color:#fff
    style D fill:#009688,stroke:#fff,color:#fff
    style F fill:#3ECF8E,stroke:#333,color:#000
    style E fill:#FFCA28,stroke:#333,color:#000
    style H fill:#7c6cff,stroke:#fff,color:#fff
    style L fill:#7c6cff,stroke:#fff,color:#fff
```

### Design patterns

| Pattern | Implementation | Benefit |
|---|---|---|
| **Engagement primitive** | `engagements` table with scope JSONB + scope_version + engine_id FK | Every client anchored to one contract; scope edits bump version → force re-ack |
| **Engine as first-class object** | `engines` table + isolation-pass timestamp gate | Engine cannot go `live` without recorded harness pass; every backtest tied to engine version |
| **Parameter schema contract** | `services/param_schema.py` — safe-AST constraint eval + type/min/max/enum + holdout | Any future engine gets a tuning UI for free; overfitting guarded by reserved tail window |
| **Content resolver** | `Postgres override → data-file default → null` | Admin edits win; safe fallbacks always exist |
| **Force-fresh admin writes** | Every save calls dependency-scoped cache invalidation | No stale content served after edit |
| **Impersonation model** | `X-Impersonate-User` header + JWT `on_behalf_of` claim + audit trail | Admins can debug live client state; every action logged with session ID |
| **Cross-tenant guard** | Every client-scoped query filtered by `current_user.client_id` | Attacker's own JWT cannot read another tenant's data |
| **Rate-limit ladder** | Per-tier + per-endpoint, backed by SlowAPI | Fair usage without hand-crafted throttling |

---

## 💻 Installation

### Prerequisites

- 🐍 **Python** 3.11+
- 📦 **Node.js** 20+ (18.18+ works)
- 🐘 **Supabase project** — [supabase.com](https://supabase.com/) *(or any Postgres 14+)*
- 🔥 **Firebase project** — [console.firebase.google.com](https://console.firebase.google.com/) *(Email/Password auth enabled + a service-account JSON)*
- 🐳 **Docker + Docker Compose** *(optional; only needed for containerised runs)*

### 1️⃣ Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .[dev]

cp .env.example .env
```

Fill in `.env`:

```bash
# App
APP_ENV=development
APP_SECRET=32+_char_random_string_for_jwt

# Database
DATABASE_URL=postgresql+psycopg2://user:pass@host:5432/dbname

# Firebase Admin (service-account JSON — bind-mount this file, never bake into image)
FIREBASE_ADMIN_CREDENTIALS=./secrets/firebase-admin.json

# Storage
STORAGE_BACKEND=supabase                       # or "local" for dev
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-jwt>
SUPABASE_BUCKET=ifa-backtest-artifacts

# Seeding
MAIN_ADMIN_EMAIL=<main-admin-email>
MAIN_ADMIN_INITIAL_PASSWORD=<initial-pw>       # rotated on first login
DEMO_CLIENT_PASSWORD=<demo-client-pw>

# Sentry (optional)
SENTRY_DSN=

# Rate limits + CORS
ALLOWED_ORIGINS=http://localhost:5173,https://<your-frontend-host>
```

```bash
alembic upgrade head        # apply the 8 migrations
python -m app.seed          # seed T&C, demo client, ENG-VAM-001
uvicorn app.main:app --reload --port 8000
```

### 2️⃣ Frontend

```bash
cd frontend
npm install
cp .env.example .env.local
```

Fill in `.env.local`:

```bash
VITE_API_BASE_URL=http://localhost:8000/api/v1
VITE_FIREBASE_API_KEY=<web-api-key>
VITE_FIREBASE_AUTH_DOMAIN=<project>.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=<project-id>
VITE_FIREBASE_STORAGE_BUCKET=<project>.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=<sender-id>
VITE_FIREBASE_APP_ID=<app-id>
VITE_SENTRY_DSN=
```

```bash
npm run dev       # Vite dev server on :5173
npm run build     # production bundle → dist/
npm run lint      # ESLint
```

### 3️⃣ Docker (production-shaped local run)

```bash
# From repo root — sources .env.production for VITE_* build args
set -a && source .env.production && set +a
docker compose -f docker-compose.prod.yml up --build
```

> ⚠️ **Never commit `.env`, `.env.local`, `.env.production`, or `backend/secrets/*.json`.**
> They are gitignored — along with `*.local`, `*.local.txt`, and `backend/secrets/`.

---

## 🔐 Admin Console

The admin console lives at **`/admin`** — role-gated (only `main_admin` and `sub_admin` land here; clients bounce to `/login`).

| Section | Route | What it controls |
|---|---|---|
| **Pulse** | `/admin` | Platform stats, needs-attention inbox with SLA age pill, wire diagram, VAM engine health |
| **Clients** | `/admin/clients` | Roster with search + pagination + drawer (engagement editor, tier, status, activity timeline) |
| **Engine registry** | `/admin/engines` | CRUD + isolation-harness recording + status transitions (`dev → isolation_pending → live`) |
| **Backtest upload** | `/admin/backtests/upload` | 6-step wizard with JSON schema validation against `schemas/backtest.schema.json` |
| **Content editor** | `/admin/content` | 7 editable sections with iframe live preview of the client dashboard |
| **T&C editor** | `/admin/terms` | Versioned T&C with the click-signed acceptance ledger |
| **Notifications** | `/admin/notifications` | Broadcast + per-client message composer |
| **Audit log** | `/admin/audit` | Filterable — impersonation session, save, login, rate-limit-hit chips |

Every mutation writes an audit row (who, when, before/after diff). Every impersonation session is bookended and the client-side red banner is sticky so no admin ever forgets they're operating on someone else's data.

---

## 📁 Project Structure

```
IFA-Backtesting-Product/
├── backend/                          # FastAPI + SQLAlchemy backend
│   ├── app/
│   │   ├── main.py                   # ASGI entrypoint, middleware, CORS, Sentry
│   │   ├── core/                     # config, security, deps, rate-limit
│   │   ├── db/
│   │   │   └── models/               # 12 SQLAlchemy models (engagement, engine, backtest, ...)
│   │   ├── api/v1/                   # Client-facing endpoints
│   │   │   ├── me.py                 # /me — user, client, engagement summary
│   │   │   ├── backtests.py          # list + detail + PDF export
│   │   │   ├── strategies.py
│   │   │   ├── requests.py
│   │   │   ├── engagement.py         # scope re-ack
│   │   │   ├── content.py            # public content read
│   │   │   └── admin/                # 16 admin API modules
│   │   ├── services/
│   │   │   ├── param_schema.py       # schema validate + safe-AST constraint + holdout
│   │   │   ├── vam.py                # VAM engine bridge
│   │   │   └── ...                   # notifications, storage, pdf
│   │   ├── schemas/                  # Pydantic DTOs
│   │   ├── templates/                # WeasyPrint PDF + email templates
│   │   ├── workers/                  # Background jobs (backtest processor)
│   │   └── seed.py                   # Idempotent tenant + T&C seeding
│   ├── alembic/versions/             # 8 versioned migrations
│   ├── tests/
│   │   ├── e2e_selenium.py           # 91 client + admin UI tests
│   │   ├── e2e_vam_and_polish.py     # 35 VAM engine + motion tests
│   │   ├── e2e_deployment_smoke.py   # 29 live-URL smoke tests
│   │   └── exhaustive/               # api / cross-tenant / edge-case / firebase / mutation
│   └── pyproject.toml
├── frontend/                         # Vite + React 19 SPA
│   ├── src/
│   │   ├── App.tsx                   # BrowserRouter, HomeGate, Protected
│   │   ├── main.tsx                  # ReactDOM.createRoot, Sentry init
│   │   ├── features/
│   │   │   ├── marketing/            # Public landing page (SEO surface)
│   │   │   ├── auth/                 # Client + admin login
│   │   │   ├── overview/             # LifecycleStepper, ScopePanel, StatTiles
│   │   │   ├── backtests/            # List + detail with recharts + PDF export
│   │   │   ├── strategies/           # List + version history
│   │   │   ├── requests/             # 4-tab form + inbox
│   │   │   ├── terms/                # Multi-step T&C acceptance
│   │   │   ├── vam/                  # VAM run trigger, GenericParamForm
│   │   │   └── admin/                # 8 admin pages (pulse, clients, engines, upload, content, terms, notifications, audit)
│   │   ├── components/
│   │   │   ├── Layout.tsx            # Client layout — sidebar + topbar + mobile drawer
│   │   │   ├── AdminLayout.tsx       # Admin layout — accent bar + inbox bell
│   │   │   ├── SEOHead.tsx           # React 19 native metadata hoister
│   │   │   ├── motion.tsx            # PageTransition, Reveal, StaggerReveal
│   │   │   ├── ui.tsx                # Card, Button, Modal, Badge, KV, SectionTitle
│   │   │   └── ...                   # NotificationBell, ImpersonationBanner, ErrorBoundary
│   │   ├── store/                    # Zustand slices — auth, content, impersonate, toast, sidebar
│   │   └── lib/                      # api client, firebase init, dark mode, motion tokens
│   ├── public/                       # robots.txt, sitemap.xml, og-image.png, favicons, site.webmanifest
│   └── package.json
├── schemas/                          # Locked JSON contracts
│   ├── backtest.schema.json          # v1.0 result format
│   ├── backtest.example.json         # Seed-friendly example
│   └── backtest.vam.schema.json      # VAM engine param schema
├── docker-compose.prod.yml           # backend + frontend + nginx
├── nginx/                            # Config + certbot volumes
├── Makefile                          # seed, deploy, test recipes
├── deploy.sh                         # SSH deploy helper
└── README.md
```

---

## 🧪 Testing

End-to-end UI coverage with **Selenium + pytest** — **~155 tests** across four suites.

```bash
cd backend
source .venv/bin/activate

# Suite 1 — client + admin UI (91 tests, headless Chrome, needs backend + frontend up)
python -m tests.e2e_selenium

# Suite 2 — VAM engine bridge + motion + polish (35 tests)
python -m tests.e2e_vam_and_polish

# Suite 3 — live-URL deployment smoke (29 tests)
LIVE_URL=https://backtestingengine.insightfusionanalytics.com python -m tests.e2e_deployment_smoke

# Suite 4 — exhaustive edge-case suite
python -m tests.exhaustive.api_exhaustive
python -m tests.exhaustive.cross_tenant
python -m tests.exhaustive.edge_cases
python -m tests.exhaustive.firebase_integration
python -m tests.exhaustive.mutation_test
```

**Coverage:**

- **Client UI** — login, T&C, dashboard render, lifecycle stepper, scope re-ack, strategies, requests, backtests list, backtest detail (equity + drawdown + KPIs + trades), PDF export, mobile hamburger drawer
- **Admin UI** — pulse stats, client roster + drawer, engagement editor, engine registry + isolation gate, backtest upload wizard, content editor with iframe preview, T&C editor, notifications, audit filters, impersonation session bookends
- **Auth + cross-tenant** — role gating, T&C wall, cross-tenant isolation, rate-limit chip, firebase invalid-token handling, suspended-account gate, not-provisioned account gate
- **Deployment smoke** — `/healthz`, JSON-LD, robots.txt, sitemap.xml, OG image, login form render, bad-password error path, Supabase-outage AuthErrorScreen, CSP headers

> Every write-marked test restores original values after execution. Seed data is idempotent — re-running `python -m app.seed` never duplicates rows.

---

## 🚀 Deployment

Deployed on **Docker + nginx + Let's Encrypt** on a VPS.

1. Copy `.env.production.example` → `.env.production`, fill in Supabase, Firebase, admin, and rate-limit values
2. Bind-mount the Firebase service-account JSON at `backend/secrets/firebase-admin.json` — **never bake it into the image**
3. Source env into the shell before building so Vite receives `VITE_*` build args:
   ```bash
   set -a && source .env.production && set +a
   docker compose -f docker-compose.prod.yml build
   docker compose -f docker-compose.prod.yml up -d --force-recreate
   ```
4. Apply migrations inside the container: `docker compose exec backend alembic upgrade head`
5. Verify: `curl -sSI https://<your-host>/healthz`

The bundled **live deployment smoke test** (`tests/e2e_deployment_smoke.py`) verifies 29 production surfaces including JSON-LD, robots, sitemap, OG image, login pages, and CSP headers.

---

## 🗺️ Roadmap

### ✅ Shipped

- [x] Full client + admin dashboards with tier system + audit log
- [x] Engagement / Engine / Parameter-schema architecture
- [x] Isolation gate before engine → live transition
- [x] Multi-step T&C flow with versioned click-signed ledger
- [x] Live impersonation with sticky banner + full audit trail
- [x] No-code admin CMS with iframe live preview (7 sections)
- [x] VAM engine bridge with Selenium
- [x] WeasyPrint PDF backtest reports
- [x] Route transitions + reveal animations
- [x] Notification bell (client + admin)
- [x] Public marketing landing + full SEO surface (JSON-LD, sitemap, robots, OG, PWA manifest)
- [x] Responsive across mobile → ultrawide
- [x] ~155-test Selenium suite + live deployment smoke

### 🚧 Planned

- [ ] Payment integration (Razorpay / Stripe — depending on tier price finalisation)
- [ ] Portfolio + case-study page for prospects
- [ ] Calendly / newsletter embed on marketing landing
- [ ] Real-time backtest progress via Server-Sent Events
- [ ] Bulk backtest re-run with parameter sweeps
- [ ] Multi-language marketing surface (Hindi + English)
- [ ] Client onboarding wizard with template strategies
- [ ] Advanced tuning UI backed by the parameter schema contract for every engine

---

<div align="center">

## 📊 IFA Backtest Engine

Built for **Insight Fusion Analytics** · Systematic Research for Indian Markets · Honest Reports · Auditable Everywhere

</div>
