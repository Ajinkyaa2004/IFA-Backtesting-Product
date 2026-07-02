import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, BarChart3, Bot, Calculator, CheckCircle2, CreditCard, FileText, Inbox, LineChart, RefreshCw, Sparkles, X } from "lucide-react";
import { Badge, Button, Card, SectionTitle, StatTile } from "../../components/ui";
import { fetchBacktests, fetchMe, fetchRequests, fetchStrategies, type BacktestListItem } from "../../lib/api";
import { useAuth } from "../../store/auth";
import { useContent } from "../../store/content";
import { Reveal, StaggerItem, StaggerReveal } from "../../components/motion";
import LifecycleStepper from "./LifecycleStepper";
import OnboardingChecklist from "./OnboardingChecklist";
import ScopePanel from "./ScopePanel";
import TierCard, { ComingSoonTile } from "./TierCard";

const POLL_INTERVAL_MS = 20_000;
// Per-browser first-visit flag. Cheap, no backend migration. If a client uses
// two browsers we show the welcome twice — acceptable for a demo-oriented banner.
const FIRST_VISIT_KEY = "ifa.welcome_dismissed";

export default function OverviewPage() {
  const me = useAuth((s) => s.me);
  const [backtests, setBacktests] = useState<BacktestListItem[]>([]);
  const [requestCount, setRequestCount] = useState(0);
  const [strategyCount, setStrategyCount] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem(FIRST_VISIT_KEY) !== "1";
  });
  const pollRef = useRef<number | null>(null);

  const dismissWelcome = () => {
    window.localStorage.setItem(FIRST_VISIT_KEY, "1");
    setShowWelcome(false);
  };

  const refresh = async () => {
    try {
      const [bts, reqs, strats] = await Promise.all([
        fetchBacktests(),
        fetchRequests(),
        fetchStrategies().catch(() => []),
      ]);
      setBacktests(bts);
      setRequestCount(reqs.length);
      setStrategyCount(strats.length);
      setLastUpdated(new Date());
    } catch {
      /* leave previous data */
    }
  };

  useEffect(() => {
    refresh();
    pollRef.current = window.setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const content = useContent((s) => s.content);
  const active = backtests.filter((b) => ["in_progress", "approved"].includes(b.status)).length;
  const completed = backtests.filter((b) => b.status === "completed").length;
  const pendingQuote = backtests.filter((b) => ["quote_requested", "quote_sent"].includes(b.status)).length;
  const demo = backtests.find((b) => b.code === "BT-2026-0001");

  const setMe = useAuth((s) => s.setMe);
  const refreshMe = async () => {
    try {
      const fresh = await fetchMe();
      setMe(fresh);
    } catch { /* stale me is fine */ }
  };

  return (
    <div className="space-y-6">
      {content.sections.announcement && content.announcement.visible && (
        <Announcement announcement={content.announcement} />
      )}

      {me?.client?.engagement && (
        <>
          <LifecycleStepper
            engagement={me.client.engagement}
            features={me.client.tier_usage?.features ?? []}
          />
          <ScopePanel engagement={me.client.engagement} onScopeReacked={refreshMe} />
        </>
      )}
      {content.sections.welcome_banner && showWelcome && demo && (
        <Card padding="p-0">
          <div className="px-6 py-4 flex items-start gap-4 bg-accent-50 dark:bg-accent-500/10 border-l-4 border-accent-500 rounded-2xl">
            <span className="mt-0.5 size-8 rounded-lg bg-accent-600 text-white flex items-center justify-center shrink-0">
              <Sparkles size={16}/>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                {content.welcome.headline}
              </div>
              <p className="mt-0.5 text-xs text-ink-600 dark:text-ink-300">
                {content.welcome.body}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Link to={`/backtests/${demo.id}`}>
                  <Button variant="accent" icon={<ArrowRight size={14}/>}>{content.welcome.primary_cta_label}</Button>
                </Link>
                <Link to="/strategies">
                  <Button variant="secondary" icon={<FileText size={14}/>}>{content.welcome.secondary_cta_label}</Button>
                </Link>
              </div>
            </div>
            <button
              onClick={dismissWelcome}
              aria-label="Dismiss welcome"
              className="text-ink-400 hover:text-ink-900 dark:hover:text-ink-100 shrink-0"
            >
              <X size={16}/>
            </button>
          </div>
        </Card>
      )}
      <Card padding="p-0">
        <div className="px-7 py-6 flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.16em] text-ink-500 dark:text-ink-400">
              {showWelcome ? "Getting started" : "Welcome back"}
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-ink-900 dark:text-ink-50">
              {me?.client?.name}
            </h1>
            <div className="mt-2 flex items-center gap-2 text-sm text-ink-500 dark:text-ink-400">
              <Badge status="active" dot>
                Tier {me?.client?.tier?.replace("tier", "")}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/strategies"><Button variant="secondary" icon={<FileText size={15}/>}>Upload strategy</Button></Link>
            <Link to="/requests"><Button variant="accent" icon={<MessageIcon/>}>New request</Button></Link>
          </div>
        </div>

        {demo && (
          <div className="border-t border-ink-100 dark:border-ink-800 bg-ink-50/60 dark:bg-ink-950/40 px-7 py-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="size-9 rounded-lg bg-accent-600/10 text-accent-700 dark:text-accent-300 flex items-center justify-center shrink-0">
                <LineChart size={18}/>
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium text-ink-900 dark:text-ink-50 truncate">
                  Demo: {demo.name}
                </div>
                <div className="text-xs text-ink-500 dark:text-ink-400">
                  {demo.code} · completed · use to preview the full backtest view
                </div>
              </div>
            </div>
            <Link to={`/backtests/${demo.id}`}>
              <Button variant="secondary" icon={<ArrowRight size={15}/>}>Open results</Button>
            </Link>
          </div>
        )}
      </Card>

      {content.sections.stat_tiles && (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatTile label="Active Backtests" value={String(active)} icon={<Activity size={14}/>} delta="in progress / approved" tone="neutral" />
          <StatTile label="Completed" value={String(completed)} icon={<CheckCircle2 size={14}/>} delta="lifetime" tone="pos" />
          <StatTile label="Pending Quotes" value={String(pendingQuote)} icon={<FileText size={14}/>} delta="awaiting decision" tone="neutral" />
          <StatTile label="Open Requests" value={String(requestCount)} icon={<Inbox size={14}/>} delta="from your side" tone="neutral" />
        </div>
      )}

      {content.sections.onboarding_checklist && me && (
        <Reveal delay={0.05}>
          <OnboardingChecklist
            me={me}
            backtests={backtests}
            strategyCount={strategyCount}
            requestCount={requestCount}
          />
        </Reveal>
      )}

      {content.sections.tier_card && me?.client?.tier_usage && (
        <Reveal delay={0.1}>
          <TierCard usage={me.client.tier_usage} />
        </Reveal>
      )}

      {/* Section 10 mocked items — copy comes from the admin content editor
          so Anmol can flip 'Growth' → 'Pro' or retitle 'AI Analyst' without
          a code change. */}
      {content.sections.placeholder_tiles && (
        <StaggerReveal className="grid grid-cols-1 sm:grid-cols-3 gap-4" stagger={0.06}>
          <StaggerItem>
            <ComingSoonTile
              icon={<Bot size={16}/>}
              title={content.placeholder_tiles.ai.title}
              subtitle={content.placeholder_tiles.ai.subtitle}
              badge={content.placeholder_tiles.ai.badge}
            />
          </StaggerItem>
          <StaggerItem>
            <ComingSoonTile
              icon={<Calculator size={16}/>}
              title={content.placeholder_tiles.optimiser.title}
              subtitle={content.placeholder_tiles.optimiser.subtitle}
              badge={content.placeholder_tiles.optimiser.badge}
            />
          </StaggerItem>
          <StaggerItem>
            <ComingSoonTile
              icon={<CreditCard size={16}/>}
              title={content.placeholder_tiles.billing.title}
              subtitle={content.placeholder_tiles.billing.subtitle}
              badge={content.placeholder_tiles.billing.badge}
            />
          </StaggerItem>
        </StaggerReveal>
      )}

      {content.sections.latest_backtests && (<>
      <Reveal delay={0.15}>
      <Card>
        <SectionTitle
          sub={lastUpdated ? `Most recent first · auto-refreshes every ${POLL_INTERVAL_MS / 1000}s · last updated ${lastUpdated.toLocaleTimeString()}` : "Most recent first"}
          action={
            <button onClick={refresh} className="text-xs text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 inline-flex items-center gap-1">
              <RefreshCw size={12}/> Refresh
            </button>
          }
        >
          Latest backtests
        </SectionTitle>
        <ul className="divide-y divide-ink-100 dark:divide-ink-800">
          {backtests.slice(0, 5).map((b) => (
            <li key={b.id} className="py-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{b.name}</div>
                <div className="text-xs text-ink-500 tabular">{b.code}</div>
              </div>
              <div className="flex items-center gap-3">
                <Badge status={b.status} dot>{b.status.replace("_", " ")}</Badge>
                <Link to={`/backtests/${b.id}`} className="text-xs font-medium text-accent-700 dark:text-accent-300 hover:underline">
                  View →
                </Link>
              </div>
            </li>
          ))}
          {backtests.length === 0 && (
            <li className="py-8 text-center text-sm text-ink-500">No backtests yet.</li>
          )}
        </ul>
      </Card>
      </Reveal>
      </>)}
    </div>
  );
}

function MessageIcon() {
  return <BarChart3 size={15} />;
}

// Site-wide announcement banner — visibility + copy managed from
// /admin/content. Kinds: info (accent), warning (amber), success (emerald).
function Announcement({ announcement: a }: { announcement: import("../../lib/contentDefaults").Announcement }) {
  const styles = {
    info:    "bg-accent-50 dark:bg-accent-500/10 border-accent-400 text-accent-800 dark:text-accent-200",
    warning: "bg-amber-50 dark:bg-amber-500/10 border-amber-500 text-amber-800 dark:text-amber-200",
    success: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 text-emerald-800 dark:text-emerald-200",
  } as const;
  return (
    <div className={`rounded-lg border-l-4 px-4 py-3 ${styles[a.kind] ?? styles.info}`}>
      {a.headline && <div className="text-sm font-semibold">{a.headline}</div>}
      {a.body && <div className="text-xs mt-1">{a.body}</div>}
      {a.cta_url && a.cta_label && (
        <a
          href={a.cta_url}
          target={a.cta_url.startsWith("http") ? "_blank" : undefined}
          rel="noopener noreferrer"
          className="inline-block mt-2 text-xs font-medium underline"
        >
          {a.cta_label} →
        </a>
      )}
    </div>
  );
}
