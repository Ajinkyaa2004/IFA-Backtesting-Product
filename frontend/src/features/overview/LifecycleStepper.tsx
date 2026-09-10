import { useMemo } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Circle, Cpu, FileText, Loader, PauseCircle, PlayCircle, Rocket, XCircle } from "lucide-react";
import { Card } from "../../components/ui";
import type { EngagementSummary, TierFeatureKey } from "../../lib/api";

/**
 * Client lifecycle stepper — Chirag Section 6. Derived view, not a stored
 * field. Pinned at the top of the client Overview, above the scope panel.
 *
 * 6 steps (4 for manual engagements):
 *   1. Set up               — engagement exists
 *   2. Terms signed         — accepted_tnc_version_id set
 *   3. Strategy received    — canonical_strategy_id set
 *   4. Engine ready         — engine_status = 'live'   (hidden for manual)
 *   5. First backtest       — has_completed_backtest
 *   6. Tuning unlocked      — engine live AND tier has 'vam_engine' feature
 *                            (hidden for manual)
 *
 * Account state overrides:
 *   - suspended → freeze the stepper, show 'Paused' banner
 *   - closed    → return null
 *
 * We use lifecycle features from the tier config to gate step 6 rather
 * than a hardcoded tier lookup — matches whatever Anmol decides at the
 * meeting.
 */

type StepState = "done" | "current" | "upcoming" | "building" | "paused";

type Step = {
  key: string;
  label: string;
  icon: React.ReactNode;
  state: StepState;
  hint?: string;
};

export default function LifecycleStepper({
  engagement,
  features,
}: {
  engagement: EngagementSummary;
  /** Tier feature keys - used to decide if 'Tuning unlocked' step is done. */
  features: TierFeatureKey[];
}) {
  const steps = useMemo(() => buildSteps(engagement, features), [engagement, features]);

  // 'closed' engagements hide the stepper entirely per Chirag Section 6.
  if (engagement.status === "closed") return null;

  const isPaused = engagement.status === "suspended";
  const doneCount = steps.filter((s) => s.state === "done").length;
  const pctDone = Math.round((doneCount / steps.length) * 100);

  return (
    <Card padding="p-0">
      <div className="px-5 pt-4 pb-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-ink-500 dark:text-ink-400 uppercase tracking-wider">
              Onboarding progress
            </div>
            <div className="text-sm text-ink-700 dark:text-ink-200 mt-0.5">
              {doneCount} of {steps.length} complete
              {isPaused && (
                <span className="ml-2 inline-flex items-center gap-1 text-[11px] px-1.5 h-4 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 font-semibold">
                  <PauseCircle size={10}/> Paused
                </span>
              )}
            </div>
          </div>
          <span className="text-[11px] tabular text-ink-500 dark:text-ink-400">{pctDone}%</span>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
          <motion.div
            className={`h-full ${isPaused ? "bg-ink-400" : "bg-accent-500"}`}
            initial={{ width: 0 }}
            animate={{ width: `${pctDone}%` }}
            transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
          />
        </div>
      </div>

      {/* Horizontal stepper - dots + labels */}
      <div className="border-t border-ink-100 dark:border-ink-800 overflow-x-auto">
        <ol className="flex items-stretch px-2 py-3 min-w-max">
          {steps.map((step, i) => (
            <li key={step.key} className="flex items-center flex-1">
              <div className="flex flex-col items-center gap-1.5 px-2 min-w-[104px]">
                <StepDot state={step.state} isPaused={isPaused} icon={step.icon}/>
                <div className="text-center">
                  <div className={`text-[11px] font-medium ${labelClass(step.state, isPaused)}`}>
                    {step.label}
                  </div>
                  {step.hint && (
                    <div className="text-[10px] text-ink-500 dark:text-ink-400 mt-0.5 line-clamp-2 max-w-[110px]">
                      {step.hint}
                    </div>
                  )}
                </div>
              </div>

              {i < steps.length - 1 && (
                <div
                  className={`flex-1 h-0.5 mx-1 rounded-full ${
                    step.state === "done" && !isPaused
                      ? "bg-accent-500"
                      : "bg-ink-200 dark:bg-ink-800"
                  }`}
                />
              )}
            </li>
          ))}
        </ol>
      </div>
    </Card>
  );
}

function StepDot({
  state,
  isPaused,
  icon,
}: {
  state: StepState;
  isPaused: boolean;
  icon: React.ReactNode;
}) {
  if (isPaused && state !== "done") {
    return (
      <span className="size-8 rounded-full bg-ink-200 dark:bg-ink-800 text-ink-500 dark:text-ink-400 flex items-center justify-center">
        <PauseCircle size={14}/>
      </span>
    );
  }
  if (state === "done") {
    return (
      <span className="size-8 rounded-full bg-accent-500 text-white flex items-center justify-center shadow-sm">
        <CheckCircle2 size={16}/>
      </span>
    );
  }
  if (state === "current") {
    return (
      <motion.span
        className="size-8 rounded-full bg-accent-500/20 text-accent-700 dark:text-accent-300 flex items-center justify-center border-2 border-accent-500"
        animate={{ scale: [1, 1.06, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
      >
        {icon}
      </motion.span>
    );
  }
  if (state === "building") {
    return (
      <span className="size-8 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center border-2 border-amber-500/40">
        <Loader size={14} className="animate-spin"/>
      </span>
    );
  }
  // upcoming
  return (
    <span className="size-8 rounded-full bg-ink-100 dark:bg-ink-800 text-ink-400 dark:text-ink-500 flex items-center justify-center">
      <Circle size={13}/>
    </span>
  );
}

function labelClass(state: StepState, isPaused: boolean): string {
  if (isPaused && state !== "done") return "text-ink-400 dark:text-ink-500";
  if (state === "done") return "text-ink-700 dark:text-ink-200";
  if (state === "current") return "text-accent-700 dark:text-accent-300 font-semibold";
  if (state === "building") return "text-amber-700 dark:text-amber-300";
  return "text-ink-400 dark:text-ink-500";
}

function buildSteps(e: EngagementSummary, features: TierFeatureKey[]): Step[] {
  // Service-agnostic path (meeting 2026-07-09): if the engagement has a
  // lifecycle_template on its Service, drive the stepper from that.
  // Backtesting keeps its existing derivation because the template step
  // keys match the state we already track (accepted_tnc, engine_status,
  // etc.). Other services show setup + terms as derived; remaining steps
  // sit as 'upcoming' until admin controls arrive in a follow-up sprint.
  if (e.lifecycle_template && e.service_code && e.service_code !== "backtesting") {
    return buildGenericSteps(e);
  }
  return buildBacktestingSteps(e, features);
}

function buildGenericSteps(e: EngagementSummary): Step[] {
  const tpl = e.lifecycle_template ?? [];
  const tncDone = e.accepted_tnc_version_id !== null;
  return tpl.map((step, idx): Step => {
    let state: StepState = "upcoming";
    let hint: string = step.description;
    if (idx === 0) {
      // Every service starts with 'setup' — always done once engagement exists.
      state = "done";
      hint = e.code;
    } else if (step.key === "terms_signed") {
      state = tncDone ? "done" : "current";
      hint = tncDone ? "Accepted" : "Awaiting client";
    } else {
      // First non-done step becomes 'current'; the rest 'upcoming'.
      // We don't derive further state for non-backtesting services yet —
      // admin will drive progression in a follow-up.
      const priorSteps = tpl.slice(0, idx);
      const allPriorDone = priorSteps.every((p, i) => i === 0 || p.key === "terms_signed" ? tncDone : true);
      state = allPriorDone && (idx === (tncDone ? 2 : -1)) ? "current" : "upcoming";
    }
    return {
      key: step.key,
      label: step.label,
      icon: <Rocket size={14}/>,
      state,
      hint,
    };
  });
}

function buildBacktestingSteps(e: EngagementSummary, features: TierFeatureKey[]): Step[] {
  const isManual = e.engine_assignment === "manual";

  const tncDone = e.accepted_tnc_version_id !== null;
  const strategyDone = e.canonical_strategy_id !== null;
  const engineDone = e.engine_status === "live";
  const engineBuilding = e.engine_status === "dev" || e.engine_status === "isolation_pending";
  const backtestDone = e.has_completed_backtest;
  const tuningUnlocked = engineDone && features.includes("vam_engine");

  // The very first step is always done — an engagement exists.
  const steps: Step[] = [
    {
      key: "setup",
      label: "Set up",
      icon: <Rocket size={14}/>,
      state: "done",
      hint: e.code,
    },
    {
      key: "terms",
      label: "Terms signed",
      icon: <FileText size={14}/>,
      state: tncDone ? "done" : "current",
      hint: tncDone ? "Accepted" : "Awaiting client",
    },
    {
      key: "strategy",
      label: "Strategy received",
      icon: <FileText size={14}/>,
      state: strategyDone
        ? "done"
        : tncDone
          ? "current"
          : "upcoming",
      hint: strategyDone ? "Marked source of truth" : "Upload + engineer confirms",
    },
  ];

  // Engine ready + Tuning unlocked steps are hidden for manual engagements
  // per Chirag Section 6.
  if (!isManual) {
    steps.push({
      key: "engine",
      label: "Engine ready",
      icon: <Cpu size={14}/>,
      state: engineDone
        ? "done"
        : engineBuilding
          ? "building"
          : strategyDone
            ? "current"
            : "upcoming",
      hint:
        engineDone
          ? "Live"
          : engineBuilding
            ? "Engineer working"
            : e.engine_assignment === "existing"
              ? "Existing engine"
              : "Bespoke",
    });
  }

  steps.push({
    key: "backtest",
    label: "First backtest",
    icon: <PlayCircle size={14}/>,
    state: backtestDone
      ? "done"
      : ((isManual && strategyDone) || (!isManual && engineDone))
        ? "current"
        : "upcoming",
    hint: backtestDone ? "Delivered" : "IFA delivers next",
  });

  if (!isManual) {
    steps.push({
      key: "tuning",
      label: "Tuning unlocked",
      icon: <Cpu size={14}/>,
      state: tuningUnlocked
        ? "done"
        : engineDone
          ? "current"
          : "upcoming",
      hint: tuningUnlocked
        ? "Self-serve VAM"
        : engineDone
          ? "Upgrade tier"
          : "After engine live",
    });
  }

  return steps;
}

// Small helper icon so LifecycleStepper doesn't need a second import.
export function InvisibleIconFallback() {
  return <XCircle className="hidden" size={0}/>;
}
