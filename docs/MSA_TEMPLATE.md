# Master Services Agreement — Template

_This is a working template drafted for Tier 3 (Enterprise) clients of Insight Fusion Analytics. It is NOT a substitute for legal review. Send to a qualified lawyer in India before signing anything above ₹1 lakh._

**Version:** v0.1 · **Last updated:** 2026-07-01

---

## Parties

**This Master Services Agreement (the "Agreement") is made on {{effective_date}} between:**

1. **Insight Fusion Analytics** (referred to as "IFA", "we", "us", "our"), a proprietorship / private limited company organised under the laws of India, having its registered office at {{ifa_registered_address}}, GSTIN {{ifa_gstin}}.

2. **{{client_legal_name}}** (referred to as the "Client", "you", "your"), a {{client_entity_type}} organised under the laws of {{client_jurisdiction}}, having its registered office at {{client_registered_address}}, {{client_registration_number_or_gstin}}.

---

## 1. Definitions

- **Backtest** — a historical simulation of a trading strategy against historical market data, delivered by IFA to the Client in a report or portal artefact.
- **Deliverable** — any backtest, PDF report, strategy document analysis, chart, dataset, or written recommendation IFA provides.
- **Strategy Document** — a written specification of a trading strategy the Client submits.
- **Confidential Information** — trade-strategy details, backtest parameters, uploaded documents, business plans, financial information, and any information marked confidential.
- **Portal** — the IFA Backtest Engine at backtestingengine.insightfusionanalytics.com.
- **Statement of Work (SOW)** — a written scope describing a specific engagement referring to this Agreement.

## 2. Services

IFA agrees to provide the following:

- (a) Access to the Portal per the Client's subscription tier
- (b) Backtesting of Strategy Documents per the tier's monthly limit
- (c) Delivery of Deliverables in the format described in the applicable SOW
- (d) Support during the hours 10:00–19:00 IST, Monday–Friday, with the first-response SLA in Schedule A
- (e) Custom strategy engineering, benchmark comparisons, and other Enterprise-tier services described in Schedule A

The Client acknowledges that:

- Backtest results are hypothetical and do NOT constitute investment advice
- Past performance is not indicative of future results
- Actual execution in live markets may differ from historical simulation

## 3. Term and termination

**Term.** This Agreement commences on the Effective Date and continues for an Initial Term of **12 months**, automatically renewing for successive **12-month** periods unless either party gives written notice **30 days** before the end of the current term.

**Termination for convenience.** Either party may terminate this Agreement on **30 days'** prior written notice. On termination:

- The Client pays for all Services performed up to the termination date
- IFA delivers any work-in-progress artefacts within **15 business days**
- Each party returns or destroys the other's Confidential Information

**Termination for cause.** Either party may terminate immediately if the other party materially breaches this Agreement and fails to cure the breach within **15 days** of written notice.

## 4. Fees and payment

Fees are set out in Schedule B and the applicable SOW.

- **Payment terms:** Net 15 days from invoice
- **Late payment:** interest at 1.5% per month or the maximum rate permitted by law, whichever is lower
- **Taxes:** Fees are exclusive of GST; the Client bears all applicable taxes
- **Refunds:** IFA offers a 7-day money-back guarantee on the first billing cycle only. No pro-rata refunds after that.
- **Suspension for non-payment:** IFA may suspend access after **7 days** past due, and terminate after **30 days**

## 5. Intellectual property

- **Client IP.** The Client retains all rights in Strategy Documents and any pre-existing intellectual property they submit.
- **IFA IP.** IFA retains all rights in the Portal, the VAM engine integration, report templates, chart libraries, and any pre-existing intellectual property.
- **Deliverables.** On payment of applicable fees, IFA grants the Client a perpetual, non-exclusive, non-transferable licence to use Deliverables for the Client's internal research and trading purposes. The Client may NOT redistribute Deliverables to third parties without IFA's written consent.
- **Anonymised aggregate data.** IFA may use anonymised, aggregated data (e.g. "clients ran 500 backtests this month") for internal analytics and marketing without identifying the Client.

## 6. Confidentiality

Each party agrees to hold the other's Confidential Information in strict confidence and not to disclose it to any third party except:

- (a) to employees or contractors with a need-to-know, under confidentiality obligations at least as protective as this Agreement
- (b) as required by law, subpoena, or regulatory authority — with prior notice to the other party where legally permitted

Confidentiality obligations survive for **3 years** after termination for ordinary Confidential Information and **indefinitely** for trade secrets.

## 7. Data protection and security

- IFA implements industry-standard technical and organisational measures to protect Client data (encryption in transit, encrypted-at-rest storage, role-based access, audit logging).
- Client data is stored in Supabase (Singapore region by default). If the Client requires India-based data residency, IFA will migrate to the Supabase India region on request; migration cost is passed through.
- **Data breach notification.** IFA will notify the Client within **72 hours** of confirming a breach that materially affects Client data. See DATA_BREACH_PROCESS.md.
- Backup: daily snapshots retained for **7 days** (Supabase Pro).

## 8. Warranties and disclaimers

**IFA warranties.** IFA warrants that:

- (a) Services will be performed in a professional and workmanlike manner consistent with industry standards
- (b) IFA has the right to enter into this Agreement and provide the Services

**Disclaimer.** IFA MAKES NO OTHER WARRANTIES, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. **Backtest results are hypothetical simulations and are NOT investment advice. IFA does not warrant that any backtest will predict live-market performance.**

## 9. Limitation of liability

Neither party will be liable to the other for indirect, incidental, consequential, special, or punitive damages, including lost profits or lost data.

Each party's aggregate liability under this Agreement will not exceed **the fees paid by the Client under the applicable SOW in the 12 months preceding the claim**. This cap does not apply to (a) either party's confidentiality breaches, (b) either party's indemnification obligations, or (c) the Client's payment obligations.

## 10. Indemnification

- **IFA indemnifies the Client** against third-party claims alleging that Deliverables infringe an Indian intellectual-property right, provided the Client (i) gives prompt written notice, (ii) allows IFA to control the defence, and (iii) cooperates in the defence at IFA's expense.
- **The Client indemnifies IFA** against third-party claims arising from (i) the Client's use of Deliverables in violation of this Agreement, (ii) the Client's Strategy Documents infringing third-party IP, or (iii) the Client's live trading based on Deliverables.

## 11. Governing law and disputes

This Agreement is governed by the laws of the Republic of India. The parties will first attempt to resolve disputes through good-faith negotiation. If unresolved after **30 days**, disputes will be referred to arbitration under the Arbitration and Conciliation Act, 1996, seated in {{arbitration_seat}} (default: Mumbai), by a sole arbitrator agreed by the parties.

## 12. General

- **Assignment.** Neither party may assign this Agreement without the other's written consent, except IFA may assign to an affiliate or successor by merger or asset sale.
- **Notices.** Written notices to the addresses in the Preamble, or by email to {{ifa_notice_email}} / {{client_notice_email}} with acknowledged receipt.
- **Entire agreement.** This Agreement + Schedules + SOWs constitute the entire agreement between the parties and supersede prior discussions.
- **Severability.** If any provision is held unenforceable, the remainder continues in effect.
- **Force majeure.** Neither party is liable for delays caused by events outside its reasonable control (natural disaster, war, government action, internet outage) provided the affected party notifies the other and resumes performance as soon as practicable.

---

## Schedule A — Service levels

| Item | Tier 1 (Starter) | Tier 2 (Growth) | Tier 3 (Enterprise) |
|---|---|---|---|
| Backtests / month | 1 | 5 | Unlimited |
| Active strategy documents | 3 | 10 | Unlimited |
| First-response support SLA | 24 h | 8 h | 2 h |
| Support channels | Email | Email, priority queue | Email, WhatsApp, dedicated Slack |
| Turnaround (per backtest) | 5 business days | 3 business days | 1 business day |
| Custom strategy engineering | No | No | Yes, subject to separate SOW |
| Benchmark comparison | No | Yes | Yes |
| VAM engine self-serve access | No | Yes | Yes |

## Schedule B — Fees

_To be filled in with the specific INR values agreed with Anmol Sir._

| Tier | Monthly fee | Annual fee (10% discount) |
|---|---|---|
| Starter | ₹ | ₹ |
| Growth | ₹ | ₹ |
| Enterprise | Custom | Custom |

---

**Signed for Insight Fusion Analytics:**

Name: _____________________________
Title: _____________________________
Date: _____________________________

**Signed for {{client_legal_name}}:**

Name: _____________________________
Title: _____________________________
Date: _____________________________
