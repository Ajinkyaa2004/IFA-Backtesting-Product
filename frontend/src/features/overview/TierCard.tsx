import { Link } from "react-router-dom";
import { Check, Sparkles, X, ArrowRight } from "lucide-react";
import { Card, SectionTitle } from "../../components/ui";

/**
 * Tier feature-matrix card. Shipped WITHOUT final pricing — Anmol Sir's
 * commercial decisions from the meeting agenda will update the numbers.
 * Until then we show the feature matrix so clients understand what they
 * have vs. what they'd unlock by upgrading.
 *
 * The `included` / `excluded` copy is intentionally hardcoded here. When
 * real prices land, edit the TIER_MATRIX constant and ship — no schema
 * or migration required. Section 9.tier_display + Section 10.tier
 * enforcement (visual layer) close on this component.
 */

type Tier = "tier1" | "tier2" | "tier3";

const TIER_MATRIX: Record<Tier, {
  label: string;
  headline: string;
  priceHint: string;
  included: string[];
  upgrade?: { toTier: string; ctaLabel: string };
}> = {
  tier1: {
    label: "Starter",
    headline: "Everything you need to submit a strategy and see one backtest.",
    priceHint: "Reach out for pricing",
    included: [
      "Client dashboard + strategy library",
      "1 backtest / month (delivered by IFA)",
      "PDF report export",
      "Legal-disclaimer-embedded delivery",
      "Terms & Conditions acceptance flow",
    ],
    upgrade: { toTier: "Growth", ctaLabel: "See what's in Growth →" },
  },
  tier2: {
    label: "Growth",
    headline: "Multiple backtests, direct engine access, priority attention.",
    priceHint: "Reach out for pricing",
    included: [
      "Everything in Starter",
      "5 backtests / month",
      "Run VAM engine directly from the portal",
      "Parameter overrides on the engine step picker",
      "Priority email support (24h SLA)",
      "Benchmark comparison against S&P 500 / NIFTY 50 / BTC",
    ],
    upgrade: { toTier: "Enterprise", ctaLabel: "Talk about Enterprise →" },
  },
  tier3: {
    label: "Enterprise",
    headline: "Custom strategy engineering + unlimited backtests + SLA.",
    priceHint: "Contact us",
    included: [
      "Everything in Growth",
      "Unlimited backtests",
      "Custom strategy engineering",
      "Optimisation runs (v2 coming)",
      "Dedicated slack channel + phone support",
      "MSA / DPA / annual audit letters",
    ],
  },
};

export default function TierCard({ tier }: { tier: string }) {
  const t = (tier?.startsWith("tier") ? tier : "tier1") as Tier;
  const info = TIER_MATRIX[t] ?? TIER_MATRIX.tier1;
  return (
    <Card>
      <SectionTitle
        sub={info.headline}
        action={
          <span className="text-[11px] uppercase tracking-[0.14em] text-ink-500 dark:text-ink-400">
            {info.priceHint}
          </span>
        }
      >
        <span className="inline-flex items-center gap-2">
          <span className="size-6 rounded-md bg-accent-600 text-white flex items-center justify-center">
            <Sparkles size={12}/>
          </span>
          Your plan · {info.label}
        </span>
      </SectionTitle>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-2">
        {info.included.map((f) => (
          <div key={f} className="flex items-start gap-2 text-sm text-ink-700 dark:text-ink-200">
            <Check size={14} className="mt-1 shrink-0 text-emerald-600 dark:text-emerald-400"/>
            <span>{f}</span>
          </div>
        ))}
      </div>

      {t !== "tier3" && (
        <div className="mt-4 pt-4 border-t border-ink-100 dark:border-ink-800 flex items-center justify-between gap-3">
          <div className="text-xs text-ink-500 dark:text-ink-400">
            Not yet available on your plan:{" "}
            <span className="text-ink-700 dark:text-ink-200">
              {t === "tier1"
                ? "self-serve VAM engine, priority support, benchmark comparison"
                : "unlimited backtests, custom strategy engineering, dedicated support"}
            </span>
          </div>
          <Link to="/requests" className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-accent-700 dark:text-accent-300 hover:underline">
            {info.upgrade?.ctaLabel ?? "Upgrade →"}
            <ArrowRight size={12}/>
          </Link>
        </div>
      )}
    </Card>
  );
}

// Re-export the disabled placeholder tile used by Section 10 mocked items.
// Colocated here because it shares the "not on your tier" vocabulary.
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
      <X size={12} className="text-ink-300 dark:text-ink-600 mt-1.5 shrink-0"/>
    </div>
  );
}
