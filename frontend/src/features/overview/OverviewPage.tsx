import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Activity, ArrowRight, BarChart3, Bot, Calculator, CheckCircle2, CreditCard, FileText, Inbox, LineChart, RefreshCw, Sparkles, X } from "lucide-react";
import { Badge, Button, Card, SectionTitle, StatTile } from "../../components/ui";
import { fetchBacktests, fetchRequests, type BacktestListItem } from "../../lib/api";
import { useAuth } from "../../store/auth";
import TierCard, { ComingSoonTile } from "./TierCard";

const POLL_INTERVAL_MS = 20_000;
// Per-browser first-visit flag. Cheap, no backend migration. If a client uses
// two browsers we show the welcome twice — acceptable for a demo-oriented banner.
const FIRST_VISIT_KEY = "ifa.welcome_dismissed";

export default function OverviewPage() {
  const me = useAuth((s) => s.me);
  const [backtests, setBacktests] = useState<BacktestListItem[]>([]);
  const [requestCount, setRequestCount] = useState(0);
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
      const [bts, reqs] = await Promise.all([fetchBacktests(), fetchRequests()]);
      setBacktests(bts);
      setRequestCount(reqs.length);
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

  const active = backtests.filter((b) => ["in_progress", "approved"].includes(b.status)).length;
  const completed = backtests.filter((b) => b.status === "completed").length;
  const pendingQuote = backtests.filter((b) => ["quote_requested", "quote_sent"].includes(b.status)).length;
  const demo = backtests.find((b) => b.code === "BT-2026-0001");

  return (
    <div className="space-y-6">
      {showWelcome && demo && (
        <Card padding="p-0">
          <div className="px-6 py-4 flex items-start gap-4 bg-accent-50 dark:bg-accent-500/10 border-l-4 border-accent-500 rounded-2xl">
            <span className="mt-0.5 size-8 rounded-lg bg-accent-600 text-white flex items-center justify-center shrink-0">
              <Sparkles size={16}/>
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink-900 dark:text-ink-50">
                Welcome to the IFA Backtest Engine
              </div>
              <p className="mt-0.5 text-xs text-ink-600 dark:text-ink-300">
                We've preloaded a demo backtest — <span className="font-medium">{demo.name}</span> —
                so you can explore the full report view. When you're ready, upload your first strategy
                document or open a new request.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Link to={`/backtests/${demo.id}`}>
                  <Button variant="accent" icon={<ArrowRight size={14}/>}>Open demo report</Button>
                </Link>
                <Link to="/strategies">
                  <Button variant="secondary" icon={<FileText size={14}/>}>Upload strategy</Button>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatTile label="Active Backtests" value={String(active)} icon={<Activity size={14}/>} delta="in progress / approved" tone="neutral" />
        <StatTile label="Completed" value={String(completed)} icon={<CheckCircle2 size={14}/>} delta="lifetime" tone="pos" />
        <StatTile label="Pending Quotes" value={String(pendingQuote)} icon={<FileText size={14}/>} delta="awaiting decision" tone="neutral" />
        <StatTile label="Open Requests" value={String(requestCount)} icon={<Inbox size={14}/>} delta="from your side" tone="neutral" />
      </div>

      {me?.client?.tier && <TierCard tier={me.client.tier} />}

      {/* Section 10 mocked items — visible placeholders so clients see the
          roadmap. Turns real once Anmol's decisions from A + C land. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <ComingSoonTile
          icon={<Bot size={16}/>}
          title="AI Analyst"
          subtitle="Ask questions about your backtest in plain English."
          badge="Growth"
        />
        <ComingSoonTile
          icon={<Calculator size={16}/>}
          title="Parameter optimiser"
          subtitle="Automated grid + walk-forward on your strategy."
          badge="Enterprise"
        />
        <ComingSoonTile
          icon={<CreditCard size={16}/>}
          title="Auto-billing"
          subtitle="Manage plan, invoices, and payment methods."
          badge="Soon"
        />
      </div>

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
    </div>
  );
}

function MessageIcon() {
  return <BarChart3 size={15} />;
}
