import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, ChevronDown, ChevronRight, CircleDot, FileText, MessageSquare, PlayCircle, Sparkles, X } from "lucide-react";
import { Card } from "../../components/ui";
import type { BacktestListItem, Me } from "../../lib/api";

/**
 * Getting-started checklist. Rendered on Overview for new clients so they
 * know what to do next. Auto-hides when 100% complete OR when explicitly
 * dismissed (per-browser flag). Each step is inferred from the same data
 * OverviewPage already fetches — no extra round-trips.
 */

const DISMISS_KEY = "ifa.onboarding_dismissed";

type Step = {
  id: string;
  title: string;
  hint: string;
  done: boolean;
  cta: { label: string; to: string; icon: React.ReactNode };
};

export default function OnboardingChecklist({
  me,
  backtests,
  strategyCount,
  requestCount,
}: {
  me: Me;
  backtests: BacktestListItem[];
  strategyCount: number;
  requestCount: number;
}) {
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(DISMISS_KEY) === "1";
  });
  const [collapsed, setCollapsed] = useState(false);

  const steps: Step[] = useMemo(() => {
    const tncDone = !me.needs_tnc_acceptance;
    const strategyUploaded = strategyCount > 0;
    const requestSubmitted = requestCount > 0;
    const backtestDelivered = backtests.some((b) => b.status === "completed");
    const demoOpened = window.localStorage.getItem("ifa.demo_opened") === "1";

    return [
      {
        id: "tnc",
        title: "Accept the Terms & Conditions",
        hint: tncDone ? "Signed and stored." : "Read + accept the engagement terms so we can start work.",
        done: tncDone,
        cta: { label: "Open T&C", to: "/terms", icon: <FileText size={13}/> },
      },
      {
        id: "demo",
        title: "Explore the demo backtest",
        hint: "See the exact report format your strategies will land in.",
        done: demoOpened || backtestDelivered,
        cta: { label: "Open demo", to: "/backtests", icon: <PlayCircle size={13}/> },
      },
      {
        id: "strategy",
        title: "Upload your first strategy document",
        hint: strategyUploaded ? "Nice — locked in as source of truth." : "PDF / DOCX / TXT. Up to 25 MB. Versioned for you.",
        done: strategyUploaded,
        cta: { label: "Upload strategy", to: "/strategies", icon: <FileText size={13}/> },
      },
      {
        id: "request",
        title: "Open your first request",
        hint: requestSubmitted ? "In our queue — Susmita will reach out." : "New strategy / change request / RFQ / clarification — any of the four.",
        done: requestSubmitted,
        cta: { label: "New request", to: "/requests", icon: <MessageSquare size={13}/> },
      },
      {
        id: "backtest",
        title: "Review your first delivered backtest",
        hint: backtestDelivered ? "Read the metrics, export the PDF." : "We'll email you when it's ready. Turnaround is per your plan's SLA.",
        done: backtestDelivered,
        cta: { label: "See backtests", to: "/backtests", icon: <PlayCircle size={13}/> },
      },
    ];
  }, [me.needs_tnc_acceptance, strategyCount, requestCount, backtests]);

  const doneCount = steps.filter((s) => s.done).length;
  const pct = Math.round((doneCount / steps.length) * 100);
  const allDone = doneCount === steps.length;

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  if (dismissed || allDone) return null;

  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="size-6 rounded-md bg-accent-600 text-white flex items-center justify-center shrink-0">
              <Sparkles size={12}/>
            </span>
            <div className="text-sm font-semibold text-ink-900 dark:text-ink-50">
              Getting started
            </div>
            <span className="text-[10px] uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
              {doneCount} / {steps.length} · {pct}%
            </span>
          </div>
          <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">
            A few quick steps and you'll have your first backtest in hand.
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="size-7 rounded-md text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 flex items-center justify-center"
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronRight size={14}/> : <ChevronDown size={14}/>}
          </button>
          <button
            onClick={dismiss}
            className="size-7 rounded-md text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 flex items-center justify-center"
            aria-label="Dismiss onboarding"
            title="Hide (you can still find these in the sidebar)"
          >
            <X size={14}/>
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-3 h-1.5 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
        <div
          className="h-full bg-accent-500 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>

      {!collapsed && (
        <ul className="mt-4 space-y-2">
          {steps.map((s) => (
            <li
              key={s.id}
              className={`p-3 rounded-lg border ${
                s.done
                  ? "border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/40 dark:bg-emerald-500/5"
                  : "border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900"
              } flex items-start gap-3`}
            >
              <span
                className={`mt-0.5 size-5 rounded-full flex items-center justify-center shrink-0 ${
                  s.done
                    ? "bg-emerald-500 text-white"
                    : "bg-ink-100 dark:bg-ink-800 text-ink-400 dark:text-ink-500"
                }`}
              >
                {s.done ? <Check size={12}/> : <CircleDot size={11}/>}
              </span>
              <div className="flex-1 min-w-0">
                <div className={`text-sm font-medium ${s.done ? "text-ink-500 dark:text-ink-400 line-through" : "text-ink-900 dark:text-ink-50"}`}>
                  {s.title}
                </div>
                <div className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">{s.hint}</div>
              </div>
              {!s.done && (
                <Link
                  to={s.cta.to}
                  className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-accent-700 dark:text-accent-300 hover:underline"
                  onClick={() => {
                    if (s.id === "demo") {
                      window.localStorage.setItem("ifa.demo_opened", "1");
                    }
                  }}
                >
                  {s.cta.icon}
                  {s.cta.label}
                  <ArrowRight size={12}/>
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
