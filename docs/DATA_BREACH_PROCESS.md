# Data Breach Response Process

_Standing operating procedure for when we suspect or confirm a security incident that affects client data. This document is the plan; when an actual incident happens, follow it verbatim — improvisation is expensive._

**Owner:** Ajinkya Dhumal (Engineering) · **Backup:** Anmol Sir · **Last reviewed:** 2026-07-01

---

## What counts as a breach

A **breach** is any of:

- Unauthorised access to Client data (Strategy Documents, backtest results, PII in Client accounts)
- Unauthorised modification or deletion of Client data
- A compromised admin or client credential (leaked password, stolen ID token, social-engineered admin)
- A publicly-exposed cloud resource (misconfigured Supabase bucket, unprotected VPS port, leaked secret in a public repo)
- A supply-chain compromise (compromised dependency, malicious npm/pip package)
- A DDoS or service-availability incident that materially disrupts client work for > 1 hour
- An IFA insider who exceeds their authorised access

If you are unsure whether an event qualifies — **treat it as a breach and follow the process**. False positives cost hours; false negatives can cost the company.

## First hour — containment

**Owner: whoever notices the issue first.**

Timer starts at **T = 0** when the incident is discovered.

- **T + 0 to T + 15 min · Notify.**
  - Post in the ops channel (WhatsApp group / Slack, whichever is faster): "SECURITY: {one-line description}. Investigating. Standing by for response."
  - Call Ajinkya (+91-XXXXXXXXXX). If unreachable within 5 min, call Anmol.
  - Do NOT discuss specifics outside the ops channel until we understand what happened.

- **T + 15 to T + 45 min · Contain.**
  - If a specific credential is compromised → rotate it (Firebase Admin SDK for user creds, `passwd` for VPS root, Supabase dashboard for service keys).
  - If a specific endpoint is being abused → nginx `deny` rule or slowapi tighter limit.
  - If a compromised token is suspected → `fb_auth.revoke_refresh_tokens(uid)` for the affected user(s).
  - If the whole VPS is suspected → `docker compose down` and preserve the state for forensics BEFORE rebooting.
  - **Preserve evidence.** Copy logs to `/opt/incident-{DATE}/` before nuking anything. Snapshot the Supabase database via the dashboard.

- **T + 45 to T + 60 min · Assess.**
  - Which clients are affected? (Query audit log filtered by suspicious action + IP)
  - What data was exposed? (Type: strategy documents, backtest results, credentials, PII, all?)
  - How did the attacker get in? (Best guess, not a full forensic root cause yet)
  - Is the attacker still active? (Are new suspicious requests still landing? If yes → contain harder)

## Hours 1–24 — investigation + notification prep

- **Preserve.** Full disk snapshot of the VPS, full DB snapshot, Cloudflare / nginx logs for the last 7 days. Store in cold storage (offline USB or an isolated bucket).
- **Investigate.**
  - Timeline of the intrusion. When did the attacker first get in? What did they touch?
  - Query the audit log — every action taken with the compromised credential.
  - Cross-reference with the Sentry alerts for the same window.
  - Diff the DB tables' state (best-effort) against a known-good snapshot.
- **Prepare disclosure content.**
  - Neutral one-line summary that Ajinkya + Anmol both approve.
  - List of affected clients (specific names for personal notifications, aggregate count for public disclosure).
  - Concrete recommendation for affected clients (rotate password, review recent activity, watch inbox for phishing).

## Hour 24–72 — client notification

**Legal / contractual commitment:** notify affected clients within **72 hours** of confirming a breach that materially affects their data (per MSA § 7).

- **Draft** the notification email in `docs/breach_notification_TEMPLATE.md` (create per-incident copy).
- **Approver:** Anmol Sir must sign off before ANY external message goes out. No exceptions.
- **Channel:**
  - Email each affected client (support@insightfusionanalytics.com sender, individual send — do NOT BCC the list).
  - For Tier 3 clients: also call their primary contact within 4 hours of the email.
  - If more than 10 clients are affected: draft a public status-page post at `/status` (build if we don't have one yet).

**What the notification MUST contain:**

1. What happened, in plain language
2. What data was potentially exposed (be specific)
3. What IFA has done to contain the breach
4. What the client should do (e.g. rotate password, review audit)
5. How to contact IFA for questions (support@, mobile)
6. Estimated timeline for follow-up updates

**What it should NOT contain:**

- Speculation on attribution ("it was a competitor")
- Blame ("this happened because of a third-party dependency")
- Legal disclaimers minimising the incident (talk to a lawyer before those go in)

## After 72 hours — remediation + post-mortem

- **Full root-cause analysis** committed to `docs/incidents/{DATE}_{SHORT_NAME}.md`. Include timeline, contributing factors, corrective actions with owners + deadlines.
- **Corrective actions** with concrete owners + deadlines. Assign each to a person by name and a specific commit / deploy target.
- **Test the fix.** Reproduce the attack path against staging or a local replica. Confirm the fix actually blocks it.
- **Retro** within 2 weeks — 30-min call between Anmol + Ajinkya. Document lessons learned in the incidents/ folder. What tooling would have detected this earlier? What documentation was missing?

## Regulatory notification (India-specific)

- **SPDI Rules under IT Act 2000, Section 43A** applies if the incident affects sensitive personal data. Consult a lawyer.
- **CERT-In (Computer Emergency Response Team India)** must be notified within **6 hours** for specified types of incidents (per the April 2022 directions). Check current rules; the list changes.
- **RBI** — if we ever process payment data ourselves, additional notification rules apply. Currently we don't (Razorpay/Stripe handle it), but note this before we do.

## Contacts on file

- **Ajinkya (Eng lead):** +91-XXXXXXXXXX · ajinkya@insightfusionanalytics.com
- **Anmol (Founder):** +91-XXXXXXXXXX · insightfusionanalytics@gmail.com
- **CERT-In:** incident@cert-in.org.in · https://www.cert-in.org.in
- **Supabase support:** through dashboard
- **Firebase support:** through Google Cloud console
- **Legal counsel:** _TBD — engage before first Tier 3 client. See ANMOL_DECISIONS_MEETING.md § H.1._

---

_Update this document every time we handle an incident, even a small one. The next incident is always different from the last one, but the process should tighten based on what we learn._
