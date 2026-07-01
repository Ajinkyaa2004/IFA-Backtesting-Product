# Decisions I'm taking on IFA Backtest Engine

_2026-07-01, by Ajinkya. Anmol Sir can override any of these at the next meeting — I'll rebuild the affected surfaces in <24h._

The philosophy: this product defines IFA as a **premium consultation firm**, not a discount SaaS. Every default below leans quality-over-cheap.

---

## ✅ I'm deciding (30 items)

### Tier & Pricing
| Q | Decision |
|---|---|
| # of tiers | **3** — Starter · Growth · Enterprise |
| Free trial? | **14-day free trial** of Growth tier, credit card required, no free-forever |
| Feature gating (backend) | **Yes** — hard 429 on limit hits, hard 403 on unavailable features |
| Upgrade timing | **Immediate, prorated** |
| Downgrade timing | **End of cycle** |
| Downgrade with excess content | **Content stays, uploads blocked until they trim** |
| Grace period for failed payment | **7 days then suspend** |

### Payments
| Q | Decision |
|---|---|
| Currencies | **INR primary, USD dual-display** (INR is the primary charge currency; USD tag shown for foreign clients) |
| GST invoices | **Auto-generated on every payment** — required for Indian clients |
| Refund policy | **7-day money-back on first month only**; no pro-rate after |

### AI Chatbot
| Q | Decision |
|---|---|
| Placeholder | **Visible-but-disabled with "Ask an Analyst — Growth tier"** — hints the upgrade |
| V2 scope | **Q&A on the user's own backtests** — not general market chat |
| LLM | **Claude** (native ecosystem, best long-context, matches our brand) |
| Investment disclaimer footer | **Mandatory on every message** |

### Growth
| Q | Decision |
|---|---|
| Consultation booking | **Calendly embed** — 15-min discovery slot |
| Newsletter platform | **Substack** (creator-first, IFA writers can migrate later) |
| Mobile app | **V2, park until 10 paying clients** — mobile web works fine |

### Branding
| Q | Decision |
|---|---|
| Positioning statement | Current: _"A client portal for strategy submission, backtest delivery, reporting, and client communication."_ — **keep as-is for MVP** |
| Brand voice | **Professional-but-warm** — institutional quality without stuffiness. Think Stripe's docs, not Bloomberg Terminal |

### Client Onboarding
| Q | Decision |
|---|---|
| Who provisions clients | **Admin (Susmita or Ajinkya)** for MVP. Post-launch → Susmita only. Later → self-signup for Starter |
| Mandatory docs | **PAN card + address proof** (needed for GST invoicing) + T&C acceptance |
| Turnaround SLA | Tier 1: **5 business days** · Tier 2: **3 business days** · Tier 3: **1 business day** |

### Infrastructure
| Q | Decision |
|---|---|
| Email sender identity | `noreply@insightfusionanalytics.com` (system) + `support@insightfusionanalytics.com` (replies) |
| Supabase Pro upgrade | **Yes, before first paying client** — 7-day PITR is non-negotiable for a paid product |

### Legal & Compliance
| Q | Decision |
|---|---|
| MSA template | **Yes, draft one now** — required for Tier 3 |
| SEBI/RBI | **Not investment advice disclaimer on every report + chatbot response** (already implemented in PDF) |
| Data residency | Current: Supabase Singapore. **Migrate to India region only if a specific client contract requires it** — not proactively |
| Data breach process | **72-hour notification** to affected clients (GDPR-inspired standard) |

### Product Roadmap
| Q | Decision |
|---|---|
| V2 timeline | **After 5 paying clients OR 3 months post-launch** — whichever comes first |
| V2 feature priority (ranked) | 1. Self-signup for Starter → 2. AI chatbot (real) → 3. Optimisation engine → 4. API access → 5. Multi-user per client → 6. Mobile |
| Long-term engine | **VAM stays primary** — Ravi maintains, we build integrations around it |

### Support
| Q | Decision |
|---|---|
| Support hours | **10 AM – 7 PM IST · Monday-Friday** |
| SLA to first response | Tier 1: 24h · Tier 2: 8h · Tier 3: 2h |
| Comms channels | **Email primary** + WhatsApp Business for Tier 3 |

### Miscellaneous
| Q | Decision |
|---|---|
| Sentry PII | **Off** — id + role only (already implemented) |
| Impersonate mode | **Read-only** (already implemented) |
| MVP email triggers | **4**: client uploaded strategy · new request · backtest marked completed · T&C updated |
| Data retention | **Forever for active clients** · 30 days soft-delete window · then archived read-only |

---

## 🚨 Still needs Anmol (8 questions)

| # | Question | Why only Anmol |
|---|---|---|
| 1 | **Tier prices in INR** (Starter / Growth / Enterprise) | Only Anmol knows the market + margin math |
| 2 | **Razorpay or Stripe?** | Commercial preference — I'll build whichever |
| 3 | **Company bank account details** for payments | Legal / tax — you own this |
| 4 | **Portfolio projects to feature** (4-6 past client wins) | Only you can OK what's public-safe |
| 5 | **Public tagline** (marketing hook) | Brand vision |
| 6 | **Monthly infra budget approval** (~₹6,500/mo for Sentry+SendGrid+Supabase Pro) | You control spend |
| 7 | **T&C lawyer review?** — yes/no before first ₹1L+ client | Legal risk tolerance |
| 8 | **Newsletter first 3 topics** OR delegate to Susmita | Content commitment |

Everything else — **I've decided and will implement now.**

---

## What I'm building right now

### Phase 4.6 — Brand-defining polish (~3 dev days)

**Day 7 — Tier system (complete)** (5h)
- Real tier matrix with limits: `tier_config.py` on backend + `TIER_LIMITS` on frontend
- Backend enforcement: 429 on backtest count limit, 403 on gated features
- Frontend: Upgrade CTAs everywhere a limit is hit
- Admin: dropdown to change tier flows through the enforcement layer

**Day 8 — Ops polish** (6h)
- Notification bell in **admin** top nav (symmetry with client)
- Forgot-password link on both login pages (Firebase native)
- Admin toggle for `Client.vam_enabled` (from drawer)
- Admin VAM engine health panel on `/admin` pulse
- CSV export: clients + backtests + audit
- Trade log CSV on backtest detail

**Day 9 — Content + brand** (6h)
- Onboarding checklist card on Overview (dynamic per-step)
- Support-hours footer with SLA table
- MSA template Markdown doc
- Data breach process doc
- Retention policy display on T&C
- Calendly embed placeholder
- Substack embed placeholder
- Wire diagram (closes Blueprint section)

Let's go.
