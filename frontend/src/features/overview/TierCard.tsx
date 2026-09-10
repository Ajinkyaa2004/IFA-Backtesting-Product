import { Link } from "react-router-dom";
import { ArrowRight, Check, Rocket, X, Zap } from "lucide-react";
import { Card, SectionTitle } from "../../components/ui";
import type { TierFeatureKey, TierUsage } from "../../lib/api";
import { useContent } from "../../store/content";

/**
 * Tier feature-matrix card. Reflects real usage from /me.client.tier_usage
 * so a client sees "2 of 5 backtests used this month" with a progress bar.
 *
 * Copy is hardcoded — Anmol Sir's final wording lands in one edit here.
 */

type FeatureRow = { key: TierFeatureKey; label: string };

const CORE_FEATURES: FeatureRow[] = [
  { key: "pdf_export",                  label: "PDF report export" },
  { key: "vam_engine",                  label: "Self-serve VAM engine" },
  { key: "benchmark_comparison",        label: "Benchmark comparison (S&P / NIFTY / BTC)" },
  { key: "priority_support",            label: "Priority support" },
  { key: "custom_strategy_engineering", label: "Custom strategy engineering" },
];

const NEXT_TIER: Record<string, { key: string; label: string } | null> = {
  tier1: { key: "tier2", label: "Growth" },
  tier2: { key: "tier3", label: "Enterprise" },
  tier3: null,
};

export default function TierCard({ usage }: { usage: TierUsage }) {
  const tierContent = useContent((s) => s.content.tier_card);
  const upgradeLabel = useContent((s) => s.content.tier_card.upgrade_cta_label);
  const featureSet = new Set(usage.features);
  const next = NEXT_TIER[usage.tier] ?? null;
  const tierCopy = tierContent[usage.tier as "tier1" | "tier2" | "tier3"];

  const btPct =
    usage.backtests_per_month == null
      ? 0
      : Math.min(100, (usage.backtests_used_this_month / usage.backtests_per_month) * 100);
  const stratPct =
    usage.max_active_strategies == null
      ? 0
      : Math.min(100, (usage.active_strategies / usage.max_active_strategies) * 100);

  return (
    <Card>
      <SectionTitle
        sub={tierCopy?.tagline ?? usage.tier_tagline}
        action={
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
              First response · {usage.support_response_hours}h SLA
            </span>
          </div>
        }
      >
        <span className="inline-flex items-center gap-2">
          <span className="size-6 rounded-md bg-accent-600 text-white flex items-center justify-center">
            <Rocket size={12} />
          </span>
          Your plan · {usage.tier_label}
        </span>
      </SectionTitle>

      {/* Usage bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2 mb-5">
        <UsageBar
          label="Backtests this month"
          used={usage.backtests_used_this_month}
          limit={usage.backtests_per_month}
          pct={btPct}
        />
        <UsageBar
          label="Active strategies"
          used={usage.active_strategies}
          limit={usage.max_active_strategies}
          pct={stratPct}
        />
      </div>

      {/* Feature matrix */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
        {CORE_FEATURES.map((f) => {
          const has = featureSet.has(f.key);
          return (
            <div key={f.key} className={`flex items-start gap-2 text-sm ${has ? "text-ink-700 dark:text-ink-200" : "text-ink-400 dark:text-ink-500 line-through"}`}>
              {has ? (
                <Check size={14} className="mt-1 shrink-0 text-emerald-600 dark:text-emerald-400" />
              ) : (
                <X size={14} className="mt-1 shrink-0 text-ink-300 dark:text-ink-600" />
              )}
              <span>{f.label}</span>
            </div>
          );
        })}
      </div>

      {next && (
        <div className="mt-4 pt-4 border-t border-ink-100 dark:border-ink-800 flex items-center justify-between gap-3">
          <div className="text-xs text-ink-500 dark:text-ink-400 flex items-center gap-1.5">
            <Zap size={12} className="text-amber-500"/>
            <span>Want more? Upgrade to <strong className="text-ink-700 dark:text-ink-200">{next.label}</strong> for more backtests + unlocked features.</span>
          </div>
          <Link
            to="/requests"
            className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-accent-700 dark:text-accent-300 hover:underline"
          >
            {upgradeLabel} <ArrowRight size={12} />
          </Link>
        </div>
      )}
    </Card>
  );
}

function UsageBar({
  label,
  used,
  limit,
  pct,
}: {
  label: string;
  used: number;
  limit: number | null;
  pct: number;
}) {
  const barColor = pct >= 100 ? "bg-red-500" : pct >= 80 ? "bg-amber-500" : "bg-accent-500";
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-ink-500 dark:text-ink-400">{label}</span>
        <span className="text-xs font-medium text-ink-700 dark:text-ink-200 tabular">
          {used}
          {limit == null ? " / ∞" : ` / ${limit}`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-ink-100 dark:bg-ink-800 overflow-hidden">
        {limit == null ? (
          <div className="h-full w-full bg-accent-200 dark:bg-accent-900/50" />
        ) : (
          <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
        )}
      </div>
    </div>
  );
}

// Small placeholder tile for "AI Analyst / Optimiser / Auto-billing".
// Colocated with TierCard so both surface the same "coming soon" language.
export function ComingSoonTile({
  icon,
  title,
  subtitle,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
}) {
  return (
    <div className="rounded-2xl border border-ink-200 dark:border-ink-800 bg-white dark:bg-ink-900 p-4 flex items-start gap-3 opacity-80">
      <span className="size-9 rounded-lg bg-ink-100 dark:bg-ink-800 text-ink-500 dark:text-ink-400 flex items-center justify-center shrink-0">
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink-900 dark:text-ink-50 truncate">{title}</span>
          {badge && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 h-4 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 inline-flex items-center font-semibold">
              {badge}
            </span>
          )}
        </div>
        <div className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">{subtitle}</div>
      </div>
      <X size={12} className="text-ink-300 dark:text-ink-600 mt-1.5 shrink-0" />
    </div>
  );
}
