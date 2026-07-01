# Anmol Sir — Product Decisions Meeting Agenda

**Date proposed:** _____________
**Duration:** ~90 minutes (1 hour if tight)
**Attendees:** Anmol, Ajinkya, Ravi (VAM engine questions), Susmita (ops sections)

**Goal:** Unblock 26 open decisions currently sitting in Todoist so the Backtest Engine can start onboarding paying clients. Every answer here converts to code within 1-3 days.

---

## 🚨 Ground rules — read before the meeting

- Every question has a **recommended default**. If Anmol is uncertain, we take the default and move on. Better to ship the default and iterate than to stall.
- The blocked items add up to **~30 Todoist checkboxes + 3 phases of work**. We must not leave without answers on Section A (tier) and Section B (payment).
- Ajinkya will implement within 72 hours of each decision. Nothing here needs a follow-up meeting.

---

## Section A · Tier System — the core commercial decision

**What's blocked:** Todoist section 7 (all 3 subitems), tier enforcement code (Section 10), tier display copy (Section 9). ~3 dev days.

### A.1 · How many tiers?

Options:
- (a) **Two tiers**: Starter + Pro. Simpler pricing page, one upsell path.
- (b) **Three tiers**: Starter + Growth + Enterprise. Standard SaaS shape. **[Recommended]**
- (c) **One tier + à la carte add-ons**: everyone gets base, they pay per backtest / per PDF.

### A.2 · Tier 1 (Starter) definition

- **Price/month:** ₹ _____ (or USD $_____)
- **Included:** How many backtests per month? Are they run-by-us or self-serve?
- **Features unlocked:**
  - [ ] Dashboard access (assumed yes)
  - [ ] Strategy uploads — max ____ documents
  - [ ] Backtests — ____ per month (e.g. 1)
  - [ ] PDF export — [ ] yes  [ ] no
  - [ ] AI chatbot — [ ] no (Tier 2+)
  - [ ] VAM engine access — [ ] no (Tier 2+)
  - [ ] Priority email support — [ ] no
- **Positioning tagline:** _____
- **Recommended:** ₹4,999/mo, 1 backtest/month, dashboard + upload + 1 PDF export, no VAM, no AI, community-support only

### A.3 · Tier 2 (Growth) definition

- **Price/month:** ₹ _____
- **Included:**
  - [ ] Backtests — ____ per month (e.g. 5)
  - [ ] Strategy uploads — up to ____ documents
  - [ ] PDF export — [ ] yes  [ ] yes with watermark  [ ] yes clean
  - [ ] AI chatbot — [ ] yes  [ ] no
  - [ ] VAM engine — [ ] yes with defaults  [ ] yes with param overrides
  - [ ] Benchmark comparison — [ ] yes (S&P 500, NIFTY 50, BTC)
  - [ ] Priority email support (24 hr SLA)
- **Recommended:** ₹14,999/mo, 5 backtests, VAM w/ overrides, PDF, chatbot, priority support

### A.4 · Tier 3 (Enterprise) definition

- **Price/month:** ₹ _____ or "contact us"
- **Included:**
  - [ ] Unlimited backtests
  - [ ] Custom strategy engineering (paid separately?)
  - [ ] Optimisation runs
  - [ ] Priority phone support
  - [ ] Dedicated slack channel
  - [ ] SLA-backed availability
  - [ ] MSA/DPA on request
- **Recommended:** "Contact us" — start at ₹49,999/mo with room to negotiate up

### A.5 · Free trial / free tier?

- (a) **7-day free trial** of Tier 2, credit card required upfront **[Recommended]**
- (b) **Freemium** — Tier 1 forever free, upgrade to unlock features
- (c) **No free anything** — everyone pays from day 1
- (d) **First backtest free, then charge** — attractive but hard to enforce

### A.6 · What EXACTLY gets gated by tier?

This becomes the enforcement logic. Anmol needs to sign off:
- [ ] Backtest count per month (hard cap → 429)
- [ ] Strategy count (hard cap → 400 on new upload)
- [ ] PDF export (button hidden or 403)
- [ ] VAM engine access (button hidden or 403)
- [ ] AI chatbot (button hidden)
- [ ] Benchmark chart overlay (hidden or greyed)
- [ ] Advanced metrics (Sortino, Profit Factor visible only to Tier 2+)
- [ ] Retention: does Tier 1 lose backtests after 30 days?

### A.7 · Upgrade / downgrade mechanics

- **Upgrade:** immediate or next billing cycle? **[Recommended: immediate, prorated]**
- **Downgrade:** immediate or end-of-cycle? **[Recommended: end of cycle]**
- **Grace period on non-payment:** 7 days / 14 days / suspend immediately? **[Recommended: 7 days then suspend]**
- **What happens to over-limit content on downgrade?** (e.g. Tier 2 with 4 strategies downgrades to Tier 1 which allows 1)
  - (a) Content stays, uploads blocked until they delete **[Recommended]**
  - (b) Excess content auto-archived
  - (c) Downgrade blocked until they manually trim

---

## Section B · Payment gateway — the money plumbing

**What's blocked:** Todoist section 10.payment_gateway. ~2 dev days to integrate, 1 day for invoicing.

### B.1 · Which processor?

- (a) **Razorpay** — best for INR clients, Indian bank integration, GST invoicing built-in. **[Recommended if >60% of clients are Indian]**
- (b) **Stripe** — best if we go international. Better UX. Higher fees on INR (~2.9%).
- (c) **Both** — auto-pick based on client country. Doubles maintenance.
- (d) **Manual bank transfer** — cheapest, worst UX. Fine for Tier 3 only.

### B.2 · Currency

- (a) **INR-only** — matches our current client base
- (b) **INR + USD** — dual pricing. **[Recommended if we plan to sell abroad]**
- (c) **USD-only** — international-first

### B.3 · Invoicing

- **Auto-generated GST invoices on each payment?** [ ] yes [ ] no
- **GSTIN required from client at signup?** [ ] yes [ ] optional
- **Invoice numbering scheme:** IFA-INV-YYYY-NNNN? Something specific?
- **Company details for invoices:** legal name, registered address, GSTIN — Anmol to provide

### B.4 · Refunds

- **Refund policy:**
  - (a) **No refunds** — clean, but hostile
  - (b) **7-day refund on first month only** **[Recommended]**
  - (c) **Pro-rated always**
- **Who processes refunds:** [ ] Anmol [ ] Susmita [ ] Automated via Razorpay dashboard

### B.5 · Who owns the money?

- Which bank account receives payments? Company account details?
- Who reconciles monthly? Ajinkya (dev) vs Susmita (ops) vs accountant?

---

## Section C · AI Chatbot — positioning + tech

**What's blocked:** Todoist section 10.ai_chatbot placeholder card. ~1 dev day for placeholder, 1-2 weeks for real thing.

### C.1 · Placeholder wording (MVP)

- "Coming in Growth tier"  vs.  "Coming soon"  vs.  "Ask an analyst"
- Should the button be **visible-but-disabled** or **hidden-below-tier**? **[Recommended: visible-but-disabled to hint upgrade]**

### C.2 · Real chatbot scope (V2)

- **Role:** Q&A about backtests? Strategy suggestions? Data exploration?
- **Model:** Claude / GPT-4 / DeepSeek? Anmol's brand preference?
- **Cost budget:** ~$0.02 per query at scale — willing to pay per client?
- **Data access:** just backtest metrics or full result JSON?

### C.3 · Compliance angle

- Chatbot output must NOT constitute investment advice. Every response needs a disclaimer footer. Anmol OK with that?
- **Recommended:** yes with mandatory 1-line "not investment advice" footer on every message.

---

## Section D · Growth pages (Section 18)

**What's blocked:** 5 subitems in Todoist section 18. ~4-5 dev days.

### D.1 · Portfolio page ("Display past projects and IFA portfolio")

- **Which projects to feature?** Anmol to send list of 4-6 past client projects (anonymised is fine).
- **Format:** case studies (long-form) or logo grid (short)?
- **Metrics to show:** return, Sharpe, timeframe — which numbers OK to publish?
- **Where does it live:** public landing page (marketing) OR inside authenticated dashboard? **[Recommended: authenticated, for prospects Ajinkya adds as trial users]**

### D.2 · Request-a-call

- (a) **Calendly embed** — plug-and-play, 15 min free consult **[Recommended]**
- (b) **Contact form** — email → Susmita's inbox, she books
- (c) **WhatsApp click-to-chat** — for Indian clients, most casual
- **Calendly URL:** ______
- **Duration:** 15 min discovery / 30 min deep dive / both?

### D.3 · Upwork feedback redirect

- **Upwork profile URL:** _____
- **Where does the CTA appear?** Post-backtest-delivery page? Sidebar? Email footer?
- **Trigger:** manual (client clicks) or auto-nudged 7 days after delivery?

### D.4 · Newsletter subscription

- (a) **Substack embed** — free, list stays with Substack **[Recommended if we write regularly]**
- (b) **Mailchimp / SendGrid list** — more control, more work
- (c) **Manual CSV export** — simplest, don't send anything yet
- **Publishing cadence:** monthly? bi-weekly? Anmol commits to writing?
- **First 3 topics** to seed the list: ____

### D.5 · Mobile app (v2 parked)

- **Q1 or Q2 2027?** **[Recommended: park, revisit after 10 paying clients]**
- **Read-only mobile web** first vs native from day 1?
- Any client explicitly asking for mobile? If yes → who?

---

## Section E · Positioning + Brand voice

**What's blocked:** Todoist section 19 (Positioning Statement — copy work).

### E.1 · The one-sentence positioning

Current draft: _"A client portal for strategy submission, backtest delivery, reporting, and client communication. Not yet a fully-automated backtesting SaaS."_

- Does Anmol want to tweak? Alternative options:
  - (a) "The backtest engine for boutique quant advisors" — narrow
  - (b) "The client portal for systematic-trading research firms" — broader
  - (c) Current version — internal-honest, less marketing-y

### E.2 · Public tagline (marketing use)

- (a) "See it before you trade it"
- (b) "Institutional-grade backtests for boutique advisors"
- (c) Anmol proposes: _____

### E.3 · Brand voice

- Formal / academic  vs.  friendly / accessible?
- Which competitor site's voice do we want to sound like? (e.g. Alpaca vs Zerodha Streak vs QuantConnect)
- Copy examples Anmol likes: ______

---

## Section F · Client onboarding process

**What's blocked:** how new clients actually go from "interested" to "using the platform".

### F.1 · Who provisions new clients today?

- Ajinkya (dev) or Susmita (ops)?
- **Recommended:** move to Susmita once self-signup lands. Until then, Ajinkya.

### F.2 · Onboarding call — included or optional?

- (a) **Every new signup gets a 30-min kickoff call** (Susmita or Anmol) **[Recommended for Tier 2+]**
- (b) **Async email + docs only** for Tier 1
- (c) **Both** — depends on tier

### F.3 · What documents must the client provide before we deliver anything?

- (a) NDA (mutual)
- (b) MSA (our standard)
- (c) KYC (PAN + address proof for GST invoicing)
- **Which of these are hard-blockers before we run backtest #1?**

### F.4 · Turnaround SLA

- Tier 1: ____ business days to deliver first backtest
- Tier 2: ____ business days
- Tier 3: ____ business days
- What communication cadence during in-progress? (Daily update? On-completion only?)

---

## Section G · Operational spend — actual money commitments

**What's blocked:** provisioning Sentry, SendGrid, Supabase Pro, Razorpay, backup domain.

### G.1 · Monthly budget cap for infra

- Anmol authorises up to ₹ ____/month for:
  - Supabase Pro ($25/mo)
  - Sentry Team plan ($26/mo)
  - SendGrid Essentials ($15/mo)
  - Razorpay transaction fees (~2%)
  - VPS hosting (current: $10/mo)
  - **Total at Pro tier: ~$75/mo ≈ ₹6,500/mo**

### G.2 · Who pays these?

- Company card owned by whom?
- Reimburse Ajinkya then transfer? (least good)
- Direct billing to company card? (best)

### G.3 · Sentry — provisioning

- Anmol OK to sign up at sentry.io with `insightfusionanalytics@gmail.com`?
- Or should we use a role account like `ops@insightfusionanalytics.com`?

### G.4 · SendGrid — sender identity

- **From address for outgoing emails:** `noreply@insightfusionanalytics.com`? `hello@`? `backtest@`?
- **Reply-to address:** `support@insightfusionanalytics.com`? Or Anmol's personal?
- **DKIM setup on the domain:** Ajinkya will do — Anmol authorises DNS changes?

### G.5 · Supabase Pro upgrade

- Right now: free tier, 1-day PITR only. **Risk: 24-hour data loss window.**
- Pro tier: $25/mo, 7-day PITR + IPv4 add-on. **[Strongly Recommended before first paying client]**
- **Anmol approves upgrade?** [ ] yes [ ] hold for now

---

## Section H · Legal + Compliance

### H.1 · T&C — who owns the master?

- Current: v1.0, 8 clauses (Engagement, Confidentiality, Data, Results, Liability, Term, Changes, Governing law).
- **Is this final?** Or does Anmol want a lawyer review before onboarding paid clients?
- **Cadence for T&C revisions:** any change bumps the version, forces re-acceptance from every existing client. OK?

### H.2 · Master Services Agreement (MSA)

- Do we have a template for MSA that we send to Tier 3 clients?
- Who signs on IFA's behalf — Anmol only, or Susmita can too?

### H.3 · SEBI / RBI considerations

- Backtest results ≠ investment advice, but the line is thin. Legal risk?
- **Recommended:** every report + chatbot response ends with "Not investment advice" disclaimer. Already done in PDF report.
- Any specific SEBI IA license issue if we serve retail clients?

### H.4 · Data residency

- Where does client data live? Supabase (Singapore currently). Any Indian client contract require India-residency?
- Contingency: migrate to Supabase India region (₹₹ implications).

### H.5 · Incident disclosure

- If we have a data breach, what's the notification obligation?
- Who is the point person to notify affected clients?

---

## Section I · Product roadmap validation (post-MVP)

### I.1 · What's the actual v2 timeline?

Currently the plan says:
- v1 (now): dashboard-first MVP with VAM
- v2: real backtest engine (built in-house or continued VAM reliance)

**When does v2 start?** After 5 paying clients? After 10? Fixed date?

### I.2 · Priority order for V2 features

Rank these 1-6:
- [ ] Self-signup flow (client signs up without Ajinkya)
- [ ] Optimisation engine (parameter sweep, walk-forward)
- [ ] Automation runs (schedule backtests on new data)
- [ ] Multi-user accounts per client (analyst + manager separate logins)
- [ ] API access (clients pull backtest results into their own systems)
- [ ] Mobile app / read-only mobile

### I.3 · Which engine is our source of truth in v2?

- (a) VAM stays as the primary engine (Ravi maintains)
- (b) Build our own engine (bigger investment, more control)
- (c) Multi-engine — VAM + one other (e.g. backtrader, zipline)

---

## Section J · Ops + support

### J.1 · Support hours

- Weekdays only (IST) / 5-day / 7-day?
- SLA to first response: 2h / 4h / 24h?

### J.2 · When something breaks in production, who gets paged?

- Ajinkya (dev) — always?
- Susmita (ops) for user-facing issues?
- On-call rotation once we have 10+ clients?

### J.3 · Client communication channels

- Email only vs Slack Connect vs WhatsApp Business?
- Where do change requests / RFQs come in today? Portal only? Also email?

### J.4 · What if Anmol is unavailable for 2+ weeks?

- Who has authority to sign new contracts?
- Who approves new tier assignments?

---

## Section K · Miscellaneous decisions with real code impact

### K.1 · Sentry PII policy

- Currently: `send_default_pii=False`. Stack traces yes, user emails no.
- **Confirm this is fine** — helps debug faster but Anmol may prefer opt-in.

### K.2 · Impersonate mode (built next in Day 4)

- Read-only mode: admin sees client dashboard exactly as client sees it, but every write endpoint refuses. Confirm Anmol wants read-only, not full read-write?
- **Recommended: read-only**. Session banner "🎭 Viewing as [client]". Every impersonation window audit-logged with start/end.

### K.3 · Email notification triggers

Once SendGrid is wired, who gets notified on what?
- [ ] Client uploads a strategy → email Ajinkya (ops notification)
- [ ] Client opens a new request → email Ajinkya + Susmita
- [ ] Admin marks backtest completed → email the specific client
- [ ] T&C updated → email all clients + require re-acceptance
- [ ] Payment received → email client with receipt + email finance
- [ ] Payment failed → email client + email Susmita
- Which of these are in for MVP? Which for later?

### K.4 · Retention

- How long do we keep completed backtests? Forever? 2 years? Client-tier dependent?
- Deleted clients — soft-delete already for 30 days, then what? Hard-delete or archive-forever?

---

## Discussion order — how to run the meeting

1. **First 10 min** — Anmol frames the commercial context (any new client signals since last chat)
2. **Next 30 min** — **Section A (Tier)** and **Section B (Payment)** — the two biggest unblockers
3. **Next 20 min** — Sections G + H (operational spend + legal)
4. **Next 15 min** — Section D (growth pages) + Section E (positioning)
5. **Remaining 15 min** — everything else, batch-decide with defaults

**Anmol's homework before the meeting:**
- Bring proposed pricing for Tier 1 / 2 / 3 in INR
- Confirm which payment processor (Razorpay likely)
- Prepare 4-6 portfolio projects to feature
- Confirm budget cap for monthly infra spend
- Decide if he wants a lawyer review of the T&C

---

## What we ship after this meeting (in priority order)

Once Anmol answers Sections A + B + G:
- **Day 5** (already in plan): Tier UI + admin controls — trivially updated with real limits from A
- **Day 6** (already in plan): Email transport — sender identity from G.4

Once Anmol answers A + B fully:
- **Phase 5, week 1:** Tier enforcement logic (backtest count limits, upload limits, feature gates)
- **Phase 5, week 2:** Payment integration (Razorpay or Stripe based on B.1)
- **Phase 5, week 3:** Invoicing + subscription management

Once Anmol answers D + E:
- **Phase 6, week 1:** Portfolio page + Request-a-call + Newsletter
- **Phase 6, week 2:** AI chatbot placeholder (then real thing if C.2 decisions come)

**Total to onboard-a-paying-client-tomorrow:** ~4 weeks of engineering after this meeting.

---

_Generated 2026-07-01. Update as decisions land._
