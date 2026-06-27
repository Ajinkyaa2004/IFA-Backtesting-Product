"""One-shot script: push the Tier 1 / Tier 2 decision tasks into Todoist.

Reads the user's API token from ../../.todoist-token.local (gitignored). Posts
to Todoist's unified /api/v1/ endpoints. Designed to be safe to re-run if the
first attempt half-fails — it prints task IDs as it goes so you can manually
delete duplicates in the UI rather than risk a destructive auto-rollback.

Created tasks:
  Section "Anmol":   4 parents + 22 sub-tasks   (priority=3, owner-anmol, client-blocker)
  Section "Ajinkya": 1 parent  + 7  sub-tasks   (priority=2, owner-ajinkya, waiting)
Total: 34 task creations.
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

import requests

# ── Constants ──────────────────────────────────────────────────────────────
PROJECT_ID = "6gh4gGm9J9q8h3HW"  # Backtest Engine Dashboard
SECTION_ANMOL = "6gh4gHmVpVC48GvW"
SECTION_AJINKYA = "6gh4gHwHH473X4JW"

API_BASE = "https://api.todoist.com/api/v1"
# Pace ourselves so we never get rate-limited (Todoist allows ~450 req / 15min).
SLEEP_BETWEEN_CALLS_S = 0.2


def load_token() -> str:
    """Read TODOIST_TOKEN from the gitignored local file."""
    env_file = Path(__file__).resolve().parents[2] / ".todoist-token.local"
    if not env_file.exists():
        sys.exit(f"missing {env_file} — token file not found")
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line.startswith("TODOIST_TOKEN="):
            return line.split("=", 1)[1].strip()
    sys.exit("TODOIST_TOKEN= line missing from .todoist-token.local")


def create_task(token: str, **fields) -> dict:
    """POST a task. Returns the API JSON (including the new task id)."""
    r = requests.post(
        f"{API_BASE}/tasks",
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
        json=fields,
        timeout=15,
    )
    if not r.ok:
        raise RuntimeError(f"POST /tasks failed: HTTP {r.status_code} body={r.text[:200]}")
    time.sleep(SLEEP_BETWEEN_CALLS_S)
    return r.json()


# ── Task definitions ───────────────────────────────────────────────────────
#
# `BLOCKS = (title, description, [sub-task titles])`
# Description is parent-only; sub-tasks are short and self-explanatory.

ANMOL_BLOCKS = [
    (
        "Tier 1 / Tier 2 commercial model — pricing, billing, refunds",
        "Decisions needed before any client can be onboarded onto a paid tier. Each sub-task is one product choice — reply on the sub-task in Todoist with your answer and Ajinkya will codify it.",
        [
            "Set Tier 1 monthly price + billing cycle (monthly / annual)",
            "Set Tier 2 monthly price + billing cycle (monthly / annual)",
            "Choose billing currency (INR / USD / both)",
            "Pick payment method for V1 (manual invoice / Stripe / Razorpay)",
            "Discount / pilot pricing for first N clients?",
            "Upgrade pricing mechanics (prorate mid-cycle, or charge next cycle?)",
            "Refund / cancellation policy per tier",
        ],
    ),
    (
        "Per-tier deliverables + SLAs",
        "What each tier actually gets when they sign up. Drives every UI gate in the dashboard.",
        [
            "Tier 1: backtests/month + manual-only or any self-serve?",
            "Tier 2: backtests/month + strategy iteration rounds included?",
            "Turnaround SLA matrix (Tier 1 / Tier 2 / Tier 3 — days each)",
            "Rush surcharge % per tier (current default in code: +40%)",
            "Strategy doc count + max file size per tier (current cap: 25 MB)",
            "Allowed request types per tier (full RFQ vs clarifications only)",
            "Support channel per tier (email / Slack / dedicated PM)",
        ],
    ),
    (
        "VAM engine (Ravi's backtester) gating model",
        "Today VAM access is a per-client flag — only Ravi has it. Decision: does it become tier-based, stay per-client, or both?",
        [
            "Which tiers get VAM access at all? (T3-only / T2+ / T1 with cap / per-client override)",
            "Monthly run cap per tier if gated (e.g. T1: 10, T2: 100, T3: unlimited)",
            "Which VAM steps each tier can use (e.g. T1 = step1 only, T2 = step1+step2, T3 = all five)",
            "Parameter caps per tier — restrict T1 to safe ranges (prevent runaway leverage), or unrestricted?",
        ],
    ),
    (
        "Client lifecycle policies",
        "How clients enter, change tiers, and leave the platform.",
        [
            "Self-service signup allowed, or admin-provisioned only? (today: admin-only)",
            "Per-tier T&C differences (e.g. Enterprise-only liability clauses)?",
            "End-of-subscription policy (data retention period, read-only window, hard cutoff)",
            "Downgrade flow — when T2 → T1, what happens to backtests/strategies over T1 quota?",
        ],
    ),
]

AJINKYA_BLOCKS = [
    (
        "Implement tier feature gates (waiting on Anmol's product answers)",
        "Engineering tasks that unblock once the four Anmol decisions above land. Estimate ~3–5 days of work from when answers arrive. Will land as a single feature branch.",
        [
            "Schema decision: clients.tier_features JSONB column vs hard-coded defaults per tier name in code",
            "Replace per-client vam_enabled flag with tier-derived check (keep override path for special cases like Ravi)",
            "Quota counter: DB column runs_this_month + monthly reset cron, vs computed on demand from audit log",
            "Hard vs soft quota enforcement (block on cap-hit vs warn admin)",
            "Disabled-feature UI: hide entirely vs show with 'Upgrade to Tier X' tooltip",
            "Tier-usage dashboard for admin (per-client current consumption vs quota)",
            "Migration policy: existing test clients (Sterling, Isolation Test) stay tier1 or move to a 'demo' pseudo-tier?",
        ],
    ),
]


def push(token: str, blocks, section_id: str, parent_labels, sub_labels, priority: int):
    """Create one parent per block + all its sub-tasks under that parent."""
    created_parents = []
    created_subs = []
    for parent_title, description, sub_titles in blocks:
        print(f"\n[PARENT] {parent_title!r}")
        parent = create_task(
            token,
            content=parent_title,
            description=description,
            project_id=PROJECT_ID,
            section_id=section_id,
            labels=parent_labels,
            priority=priority,
        )
        pid = parent["id"]
        print(f"         id={pid}  url={parent.get('url', '-')}")
        created_parents.append(parent)

        for sub_title in sub_titles:
            sub = create_task(
                token,
                content=sub_title,
                project_id=PROJECT_ID,
                section_id=section_id,
                parent_id=pid,
                labels=sub_labels,
                priority=priority,
            )
            print(f"  └─ sub id={sub['id']}  {sub_title[:80]!r}")
            created_subs.append(sub)
    return created_parents, created_subs


def main():
    token = load_token()
    print(f"Token loaded ({len(token)} chars).  Starting push to Todoist…")

    anmol_p, anmol_s = push(
        token,
        ANMOL_BLOCKS,
        section_id=SECTION_ANMOL,
        parent_labels=["owner-anmol", "client-blocker"],
        sub_labels=["owner-anmol", "client-blocker"],
        priority=3,
    )
    aj_p, aj_s = push(
        token,
        AJINKYA_BLOCKS,
        section_id=SECTION_AJINKYA,
        parent_labels=["owner-ajinkya", "waiting"],
        sub_labels=["owner-ajinkya", "waiting"],
        priority=2,
    )

    print("\n" + "═" * 70)
    print(f"DONE.  Created {len(anmol_p)+len(aj_p)} parents + "
          f"{len(anmol_s)+len(aj_s)} sub-tasks = "
          f"{len(anmol_p)+len(aj_p)+len(anmol_s)+len(aj_s)} tasks total.")
    print("═" * 70)


if __name__ == "__main__":
    main()
