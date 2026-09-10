/**
 * Public marketing landing page at `/`. Shown to every unauthenticated
 * visitor; authenticated users are redirected to their dashboard by App.tsx.
 *
 * Structure is deliberately SEO-friendly:
 *   - one <h1> (product name + one-liner)
 *   - <h2> per section
 *   - semantic <section>, <nav>, <footer>
 *   - lucide icons carry aria-hidden
 *   - JSON-LD (Organization + SoftwareApplication + Product per tier)
 *     lives on this page via <SEOHead structuredData={...}/>
 *
 * All styling is Tailwind — matches the app's dark ink + accent-purple
 * palette. Framer-motion is deliberately NOT imported here to keep the
 * public bundle small; CSS transitions handle the reveal.
 */

import { Link } from "react-router-dom";
import {
  ArrowRight,
  BarChart3,
  CheckCircle2,
  Cpu,
  FileCheck2,
  LineChart,
  Lock,
  Mail,
  Rocket,
  ShieldCheck,
  Users,
  Zap,
} from "lucide-react";
import SEOHead from "../../components/SEOHead";

// Runtime-configured site URL — swaps to any domain with an env change.
// Fallback preserves old prod host so any transitional build keeps working.
const SITE = (import.meta.env.VITE_SITE_URL as string | undefined)
  ?? "https://backtestingengine.insightfusionanalytics.com";

const TIERS = [
  {
    code: "silver",
    name: "Silver",
    price: "Starter",
    tagline: "Get a working systematic strategy in your hands.",
    features: [
      "1 strategy backtest per month",
      "Full trade log + equity curve + drawdown",
      "PDF report with disclaimers",
      "Email support",
    ],
    cta: "Book a discovery call",
  },
  {
    code: "gold",
    name: "Gold",
    price: "Professional",
    tagline: "Iterate on your strategy with real feedback loops.",
    features: [
      "Everything in Silver",
      "3 backtests per month + parameter sweeps",
      "Direct chat with strategy lead",
      "Priority queue on the shared engine",
    ],
    cta: "Book a strategy call",
    highlighted: true,
  },
  {
    code: "platinum",
    name: "Platinum",
    price: "Enterprise",
    tagline: "Bespoke engine build + operational SLA.",
    features: [
      "Everything in Gold",
      "Bespoke engine built for your strategy family",
      "Isolation harness + walk-forward reports",
      "1-business-day request SLA",
      "Named engineer on your account",
    ],
    cta: "Book an enterprise call",
  },
];

const FEATURES = [
  {
    icon: <Cpu size={22}/>,
    title: "Clear scope up front",
    body: "Every engagement records the tier, the deliverable and the engine your strategy runs on. You always know what version of the code produced which result.",
  },
  {
    icon: <LineChart size={22}/>,
    title: "Full reports, not just numbers",
    body: "Equity curve, drawdown, Sharpe, Sortino, hit rate, per-trade log. Every result page carries the full picture. PDF export included.",
  },
  {
    icon: <ShieldCheck size={22}/>,
    title: "Holdout is enforced",
    body: "You cannot tune on data set aside for out-of-sample validation. If your date range overlaps, we trim it. Simple rule against overfitting.",
  },
  {
    icon: <FileCheck2 size={22}/>,
    title: "Every result is auditable",
    body: "Backtests are versioned and immutable. Each one is linked to a strategy version and engine version. Rerunning with the same params is one click.",
  },
];

const STEPS = [
  {
    n: 1,
    title: "Sign the terms",
    body: "Read and accept IFA's engagement terms - click-signed, timestamped, versioned. If terms are ever updated, you'll be prompted to re-acknowledge.",
  },
  {
    n: 2,
    title: "Upload your strategy",
    body: "PDF or CSV. Our team reviews it, asks any clarification questions, and confirms it fits your tier's scope.",
  },
  {
    n: 3,
    title: "We backtest it",
    body: "Depending on tier, on a shared or bespoke engine. You watch progress in real time; results land in your dashboard when done.",
  },
  {
    n: 4,
    title: "Review + iterate",
    body: "Filter by tag, sort by Sharpe, drill into individual trades, export PDFs, request tuning. Every iteration keeps history.",
  },
];

/**
 * Portfolio of products + client engagements we've shipped. Rendered in the
 * PortfolioSection between "How it works" and "Pick your tier". Content is
 * modeled after an Upwork portfolio card: title, category tag, one-liner,
 * two or three concrete deliverables, and a tag row for the tech / method.
 *
 * `href` is optional — a live URL (VAM engine, WordPress site) links out.
 * `accent` picks the gradient for the icon panel so cards don't all look
 * identical when the client scrolls.
 */
type PortfolioKind =
  | "backtest-engine"
  | "vam-engine"
  | "strategy-library"
  | "market-pulse"
  | "universe-scanner"
  | "admin-console";

const PORTFOLIO: {
  kind: PortfolioKind;
  accent: string;
  category: string;
  title: string;
  body: string;
  deliverables: string[];
  tags: string[];
  href?: string;
}[] = [
  {
    kind: "backtest-engine",
    accent: "from-accent-500 to-violet-600",
    category: "Product",
    title: "IFA Backtest Engine",
    body: "The very platform you're on. Serviced client portal + backtest engine, tier-gated with immutable results, an admin console with audit trail, and a per-engagement quote system.",
    deliverables: [
      "Self-serve signup + admin approval flow",
      "Locked v1.0 result schema - every backtest reproducible",
      "Tiered engagements + WhatsApp delivery workflow",
    ],
    tags: ["FastAPI", "React 19", "PostgreSQL", "Firebase Auth"],
    href: "https://backtestingengine.insightfusionanalytics.com",
  },
  {
    kind: "vam-engine",
    accent: "from-emerald-500 to-teal-600",
    category: "Live engine",
    title: "VAM - Volatility Adjusted Momentum",
    body: "Live systematic momentum engine that trades Indian equities. Runs a proprietary volatility-adjusted score and executes with position sizing that scales inversely to realised risk.",
    deliverables: [
      "Real-time signal generation + broker routing",
      "Parameter-tuning UI for approved clients",
      "Live dashboard with equity + drawdown streaming",
    ],
    tags: ["Python", "NumPy/pandas", "TradingView data", "Zerodha Kite"],
    href: "https://backtestravi.insightfusionanalytics.com",
  },
  {
    kind: "strategy-library",
    accent: "from-sky-500 to-blue-600",
    category: "Strategy research",
    title: "Swing-trading strategy library",
    body: "Ready-to-backtest rulebooks - Alligator + Central Pivot Range, Supertrend + Heikin-Ashi + Fractals, RSI mean-reversion - with clear entries, stops, R-multiples, and holding rules for pullback and breakout setups.",
    deliverables: [
      "Rulebooks in plain English + code",
      "Three entry-timing models per strategy",
      "Backtested across midcaps + Nifty universe",
    ],
    tags: ["Alligator", "CPR", "Supertrend", "Heikin-Ashi", "Fractals"],
  },
  {
    kind: "market-pulse",
    accent: "from-amber-500 to-orange-600",
    category: "Analytics",
    title: "Market Pulse dashboard",
    body: "Live market-breadth and macro dashboard for internal desk use - advance/decline, sector rotation, volatility regime, and open-interest heatmaps rolled up into one view.",
    deliverables: [
      "Real-time NSE breadth ingestion",
      "Sector rotation + heatmap widgets",
      "Publishable snapshots for research notes",
    ],
    tags: ["FastAPI", "WebSockets", "React", "Recharts"],
  },
  {
    kind: "universe-scanner",
    accent: "from-fuchsia-500 to-pink-600",
    category: "Custom engagement",
    title: "Bespoke Phase-A universe scanner",
    body: "Company selection module for a swing-trading engagement - ranks a ₹1k-20k crore universe on 3/6/9-month trends, smoothness, higher-highs consistency and quarterly fundamentals, with every setting exposed for admin tuning.",
    deliverables: [
      "Reproducible ranked shortlist per selection date",
      "Adjustable trend + fundamentals filters",
      "Full audit trail on every selection run",
    ],
    tags: ["Python", "yfinance/GDFL", "Pydantic", "Alembic"],
  },
  {
    kind: "admin-console",
    accent: "from-slate-600 to-ink-800",
    category: "Compliance & ops",
    title: "T&C, audit + admin console",
    body: "Every action on the platform is signed by a user and timestamped. Version-controlled engagement terms, per-user acceptance ledger, an inbox for pending review items, and a live-edit content CMS for the marketing surface.",
    deliverables: [
      "Version-locked T&C with click-signed acceptance",
      "Append-only audit log with IP + actor",
      "Content editor with live preview iframe",
    ],
    tags: ["Alembic migrations", "Row-level access", "Signed URLs"],
  },
];

/**
 * Product-specific hero mini-mockups for the portfolio cards. Each `kind`
 * renders a self-contained SVG dashboard/chart/log widget that visually
 * mirrors what the actual product does — chart for the engines, table for
 * the scanner, log rows for the admin console — so the card doesn't
 * degenerate into six identical gradient-plus-icon blocks.
 *
 * Rendered inside the h-32 header slot of each portfolio card.
 * viewBox is 320x128 so the SVG scales cleanly at any card width.
 */
function PortfolioThumbnail({ kind }: { kind: PortfolioKind }) {
  switch (kind) {
    case "backtest-engine":
      return (
        <svg viewBox="0 0 320 128" className="w-full h-full" aria-hidden>
          <defs>
            <linearGradient id="bt-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#7c3aed" />
              <stop offset="1" stopColor="#4c1d95" />
            </linearGradient>
            <linearGradient id="bt-area" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#ffffff" stopOpacity="0.55" />
              <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
            </linearGradient>
          </defs>
          <rect width="320" height="128" fill="url(#bt-bg)" />
          {/* KPI tiles */}
          <g fill="rgba(255,255,255,0.14)">
            <rect x="14" y="14" width="72" height="30" rx="6" />
            <rect x="94" y="14" width="72" height="30" rx="6" />
            <rect x="174" y="14" width="72" height="30" rx="6" />
          </g>
          <g fill="rgba(255,255,255,0.9)" fontFamily="ui-monospace, SFMono-Regular, monospace" fontSize="10" fontWeight="700">
            <text x="20" y="34">+27.4%</text>
            <text x="100" y="34">1.31</text>
            <text x="180" y="34">-14.2%</text>
          </g>
          <g fill="rgba(255,255,255,0.55)" fontFamily="ui-sans-serif, system-ui" fontSize="6">
            <text x="20" y="42">RETURN</text>
            <text x="100" y="42">SHARPE</text>
            <text x="180" y="42">MAX DD</text>
          </g>
          {/* Equity curve */}
          <path
            d="M 14 100 L 40 90 L 62 96 L 88 78 L 114 82 L 140 66 L 170 72 L 200 54 L 232 60 L 260 46 L 290 50 L 306 42"
            fill="none"
            stroke="rgba(255,255,255,0.9)"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 14 100 L 40 90 L 62 96 L 88 78 L 114 82 L 140 66 L 170 72 L 200 54 L 232 60 L 260 46 L 290 50 L 306 42 L 306 116 L 14 116 Z"
            fill="url(#bt-area)"
          />
        </svg>
      );

    case "vam-engine":
      return (
        <svg viewBox="0 0 320 128" className="w-full h-full" aria-hidden>
          <defs>
            <linearGradient id="vam-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#10b981" />
              <stop offset="1" stopColor="#0f766e" />
            </linearGradient>
          </defs>
          <rect width="320" height="128" fill="url(#vam-bg)" />
          {/* Candlesticks - 20 of them, mostly green with a couple red */}
          {(() => {
            const candles = [
              { x: 14,  o: 82, c: 74 }, { x: 24, o: 78, c: 68 }, { x: 34, o: 72, c: 78 },
              { x: 44,  o: 76, c: 66 }, { x: 54, o: 68, c: 60 }, { x: 64, o: 62, c: 70 },
              { x: 74,  o: 68, c: 58 }, { x: 84, o: 60, c: 52 }, { x: 94, o: 54, c: 60 },
              { x: 104, o: 58, c: 46 }, { x: 114, o: 48, c: 40 }, { x: 124, o: 42, c: 48 },
              { x: 134, o: 44, c: 34 }, { x: 144, o: 36, c: 28 }, { x: 154, o: 30, c: 38 },
              { x: 164, o: 34, c: 24 }, { x: 174, o: 26, c: 20 }, { x: 184, o: 22, c: 30 },
              { x: 194, o: 28, c: 18 }, { x: 204, o: 20, c: 14 },
            ];
            return candles.map((k) => {
              const green = k.c < k.o;
              const top = Math.min(k.o, k.c);
              const h = Math.max(2, Math.abs(k.o - k.c));
              return (
                <g key={k.x}>
                  <line
                    x1={k.x + 3}
                    y1={top - 4}
                    x2={k.x + 3}
                    y2={top + h + 4}
                    stroke="rgba(255,255,255,0.55)"
                    strokeWidth="1"
                  />
                  <rect
                    x={k.x}
                    y={top}
                    width={6}
                    height={h}
                    fill={green ? "rgba(255,255,255,0.9)" : "rgba(15,23,42,0.6)"}
                    rx="1"
                  />
                </g>
              );
            });
          })()}
          {/* Buy signal marker */}
          <g>
            <circle cx="94" cy="60" r="6" fill="rgba(255,255,255,0.95)" />
            <path d="M 91 60 L 94 63 L 98 57" stroke="#059669" strokeWidth="1.75" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          {/* Live label */}
          <g>
            <rect x="230" y="12" width="76" height="20" rx="10" fill="rgba(0,0,0,0.35)" />
            <circle cx="242" cy="22" r="3" fill="#4ade80">
              <animate attributeName="opacity" values="1;0.3;1" dur="1.6s" repeatCount="indefinite" />
            </circle>
            <text x="250" y="26" fill="rgba(255,255,255,0.95)" fontFamily="ui-sans-serif, system-ui" fontSize="10" fontWeight="700">
              LIVE · VAM
            </text>
          </g>
          {/* Ticker text bottom */}
          <text x="14" y="118" fill="rgba(255,255,255,0.7)" fontFamily="ui-monospace" fontSize="9">
            RELIANCE · +2.4%  ·  INFY · +1.8%
          </text>
        </svg>
      );

    case "strategy-library":
      return (
        <svg viewBox="0 0 320 128" className="w-full h-full" aria-hidden>
          <defs>
            <linearGradient id="sl-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#0ea5e9" />
              <stop offset="1" stopColor="#1d4ed8" />
            </linearGradient>
          </defs>
          <rect width="320" height="128" fill="url(#sl-bg)" />
          {/* Grid lines */}
          <g stroke="rgba(255,255,255,0.08)" strokeWidth="1">
            <line x1="0" y1="40" x2="320" y2="40" />
            <line x1="0" y1="70" x2="320" y2="70" />
            <line x1="0" y1="100" x2="320" y2="100" />
          </g>
          {/* Three different strategy equity curves */}
          <path
            d="M 14 96 L 40 92 L 68 84 L 96 78 L 128 70 L 158 66 L 190 54 L 222 50 L 254 42 L 288 32 L 306 30"
            fill="none"
            stroke="rgba(255,255,255,0.95)"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <path
            d="M 14 100 L 40 96 L 68 92 L 96 88 L 128 82 L 158 82 L 190 74 L 222 70 L 254 68 L 288 60 L 306 56"
            fill="none"
            stroke="rgba(163,230,253,0.9)"
            strokeWidth="1.4"
            strokeDasharray="3 3"
            strokeLinecap="round"
          />
          <path
            d="M 14 104 L 40 100 L 68 102 L 96 96 L 128 94 L 158 88 L 190 90 L 222 84 L 254 76 L 288 74 L 306 68"
            fill="none"
            stroke="rgba(56,189,248,0.9)"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
          {/* Legend chips */}
          <g fontFamily="ui-sans-serif, system-ui" fontSize="8" fontWeight="600">
            <g transform="translate(14, 14)">
              <rect width="68" height="16" rx="8" fill="rgba(0,0,0,0.28)" />
              <circle cx="8" cy="8" r="3" fill="rgba(255,255,255,0.95)" />
              <text x="16" y="11" fill="rgba(255,255,255,0.95)">Alligator+CPR</text>
            </g>
            <g transform="translate(88, 14)">
              <rect width="80" height="16" rx="8" fill="rgba(0,0,0,0.28)" />
              <circle cx="8" cy="8" r="3" fill="rgba(163,230,253,0.95)" />
              <text x="16" y="11" fill="rgba(255,255,255,0.95)">Supertrend+HA</text>
            </g>
            <g transform="translate(174, 14)">
              <rect width="76" height="16" rx="8" fill="rgba(0,0,0,0.28)" />
              <circle cx="8" cy="8" r="3" fill="rgba(56,189,248,0.95)" />
              <text x="16" y="11" fill="rgba(255,255,255,0.95)">RSI Reversion</text>
            </g>
          </g>
        </svg>
      );

    case "market-pulse":
      return (
        <svg viewBox="0 0 320 128" className="w-full h-full" aria-hidden>
          <defs>
            <linearGradient id="mp-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f59e0b" />
              <stop offset="1" stopColor="#c2410c" />
            </linearGradient>
          </defs>
          <rect width="320" height="128" fill="url(#mp-bg)" />
          {/* Sector heatmap grid - 8 columns × 4 rows */}
          {(() => {
            const cells: { r: number; c: number; a: number }[] = [];
            // deterministic pseudo-random alphas so it always looks the same
            const seeds = [
              0.82, 0.35, 0.55, 0.75, 0.9, 0.42, 0.68, 0.28,
              0.6, 0.85, 0.4, 0.5, 0.72, 0.88, 0.34, 0.62,
              0.44, 0.66, 0.78, 0.36, 0.58, 0.8, 0.52, 0.48,
              0.7, 0.38, 0.6, 0.86, 0.46, 0.7, 0.32, 0.55,
            ];
            for (let r = 0; r < 4; r++) for (let c = 0; c < 8; c++) {
              cells.push({ r, c, a: seeds[r * 8 + c] });
            }
            return cells.map((cell) => (
              <rect
                key={`${cell.r}-${cell.c}`}
                x={14 + cell.c * 36}
                y={40 + cell.r * 16}
                width="32"
                height="12"
                rx="2"
                fill="rgba(255,255,255,0.95)"
                opacity={cell.a}
              />
            ));
          })()}
          {/* Header labels */}
          <g fontFamily="ui-sans-serif, system-ui" fontSize="7" fill="rgba(255,255,255,0.85)" fontWeight="600">
            <text x="14" y="30">SECTOR HEATMAP · TODAY</text>
          </g>
          {/* Bottom stats row */}
          <g fontFamily="ui-monospace" fontSize="9" fill="rgba(255,255,255,0.95)" fontWeight="700">
            <text x="14" y="120">ADV: 1,842</text>
            <text x="94" y="120">DEC: 984</text>
            <text x="164" y="120">RATIO: 1.87</text>
            <text x="240" y="120">VIX: 12.4</text>
          </g>
        </svg>
      );

    case "universe-scanner":
      return (
        <svg viewBox="0 0 320 128" className="w-full h-full" aria-hidden>
          <defs>
            <linearGradient id="us-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#d946ef" />
              <stop offset="1" stopColor="#be185d" />
            </linearGradient>
          </defs>
          <rect width="320" height="128" fill="url(#us-bg)" />
          {/* Header */}
          <text x="14" y="20" fill="rgba(255,255,255,0.95)" fontFamily="ui-sans-serif, system-ui" fontSize="9" fontWeight="700">
            RANKED SHORTLIST · ₹1K–20K CR
          </text>
          {/* Table header */}
          <g fill="rgba(255,255,255,0.55)" fontFamily="ui-sans-serif, system-ui" fontSize="7" fontWeight="700">
            <text x="14" y="38">#</text>
            <text x="34" y="38">TICKER</text>
            <text x="122" y="38">SCORE</text>
            <text x="180" y="38">TREND</text>
            <text x="248" y="38">Δ 3M</text>
          </g>
          {/* Divider */}
          <line x1="14" y1="42" x2="306" y2="42" stroke="rgba(255,255,255,0.25)" />
          {/* 5 rows */}
          {[
            { i: "1", t: "POLYCAB", s: "94.6", d: "+22.4%" },
            { i: "2", t: "AUBANK",  s: "91.3", d: "+18.7%" },
            { i: "3", t: "TATAPWR", s: "88.1", d: "+16.2%" },
            { i: "4", t: "COFORGE", s: "85.4", d: "+13.9%" },
            { i: "5", t: "DELHIVR", s: "82.7", d: "+11.5%" },
          ].map((row, idx) => (
            <g key={row.t} fontFamily="ui-monospace" fontSize="8" fill="rgba(255,255,255,0.9)">
              <text x="14" y={56 + idx * 14}>{row.i}</text>
              <text x="34" y={56 + idx * 14} fontWeight="700">{row.t}</text>
              <text x="122" y={56 + idx * 14}>{row.s}</text>
              {/* trend bar */}
              <rect
                x="180"
                y={49 + idx * 14}
                width={parseFloat(row.s) * 0.55}
                height="6"
                rx="1"
                fill="rgba(255,255,255,0.75)"
              />
              <text x="248" y={56 + idx * 14}>{row.d}</text>
            </g>
          ))}
        </svg>
      );

    case "admin-console":
      return (
        <svg viewBox="0 0 320 128" className="w-full h-full" aria-hidden>
          <defs>
            <linearGradient id="ac-bg" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#475569" />
              <stop offset="1" stopColor="#0f172a" />
            </linearGradient>
          </defs>
          <rect width="320" height="128" fill="url(#ac-bg)" />
          {/* Header row */}
          <g fontFamily="ui-sans-serif, system-ui" fontSize="8" fontWeight="700">
            <text x="14" y="18" fill="rgba(255,255,255,0.95)">AUDIT LOG</text>
            <g transform="translate(266, 8)">
              <rect width="40" height="14" rx="7" fill="rgba(16,185,129,0.28)" />
              <circle cx="8" cy="7" r="2" fill="#34d399" />
              <text x="14" y="10" fill="rgba(255,255,255,0.95)" fontSize="7">SIGNED</text>
            </g>
          </g>
          {/* Log rows */}
          {[
            { t: "14:32", a: "signup.approve",  who: "admin",   ok: true },
            { t: "14:18", a: "backtest.upload", who: "chirag",  ok: true },
            { t: "14:04", a: "terms.accept",    who: "client",  ok: true },
            { t: "13:47", a: "quote.send",      who: "admin",   ok: true },
            { t: "13:22", a: "engagement.edit", who: "admin",   ok: true },
          ].map((row, idx) => (
            <g key={idx} fontFamily="ui-monospace" fontSize="8">
              <rect
                x="14"
                y={30 + idx * 18}
                width="292"
                height="14"
                rx="3"
                fill="rgba(255,255,255,0.05)"
              />
              <text x="22" y={40 + idx * 18} fill="rgba(255,255,255,0.55)">{row.t}</text>
              <text x="58" y={40 + idx * 18} fill="rgba(255,255,255,0.95)" fontWeight="700">{row.a}</text>
              <text x="180" y={40 + idx * 18} fill="rgba(255,255,255,0.7)">{row.who}</text>
              <g transform={`translate(280, ${34 + idx * 18})`}>
                <circle cx="4" cy="4" r="4" fill="#10b981" />
                <path d="M 2 4 L 3.5 5.5 L 6 3" stroke="white" strokeWidth="1" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            </g>
          ))}
        </svg>
      );
  }
}

const FAQ = [
  {
    q: "Is this a self-serve SaaS?",
    a: "No - it's a serviced portal. You give us your strategy, we run backtests for you against an engine our team maintains. The dashboard is where you see results, request changes and manage your engagement.",
  },
  {
    q: "What markets and instruments?",
    a: "Currently Indian equities (NSE cash + F&O). Multi-asset support is on the roadmap for the Enterprise tier.",
  },
  {
    q: "How is my strategy protected?",
    a: "Your strategy artifacts stay in your engagement bucket. Only your account team plus you can see them. Every access is audit-logged.",
  },
  {
    q: "Do backtests include realistic costs?",
    a: "Yes - brokerage, STT, exchange fees, slippage model per instrument liquidity band. All disclosed in the report footer.",
  },
  {
    q: "Can I run my own params?",
    a: "Gold and Platinum tiers give you a tuning UI for the engine's declared parameter schema, with min/max and cross-parameter constraints enforced.",
  },
  {
    q: "What's the SLA on new requests?",
    a: "Platinum: 1 business day. Gold: 2 business days. Silver: best-effort within 5 business days.",
  },
];

export default function LandingPage() {
  const organizationLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Insight Fusion Analytics",
    url: SITE,
    logo: `${SITE}/favicon-512.png`,
    description: "Systematic trading strategy research, backtest, and engine delivery for Indian markets.",
    sameAs: [] as string[],
    contactPoint: {
      "@type": "ContactPoint",
      email: "insightfusionanalytics@gmail.com",
      contactType: "Sales",
      areaServed: "IN",
    },
  };

  const softwareLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "IFA Backtest Engine",
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    description: "Client portal for systematic strategy research, backtests, and engine delivery.",
    offers: TIERS.map((t) => ({
      "@type": "Offer",
      name: `${t.name} - ${t.price}`,
      description: t.tagline,
      category: t.code,
    })),
    provider: { "@type": "Organization", name: "Insight Fusion Analytics" },
  };

  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQ.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };

  return (
    <div className="min-h-screen bg-white dark:bg-ink-950 text-ink-900 dark:text-ink-50">
      <SEOHead
        title="IFA Backtest Engine - Systematic strategy backtests for Indian markets"
        description="Insight Fusion Analytics builds and backtests systematic trading strategies for Indian markets. Client portal for strategy submission, backtest results, and engine delivery."
        path="/"
        robots="index, follow"
        structuredData={[organizationLd, softwareLd, faqLd]}
      />

      <TopNav />

      <main>
        <Hero />
        <FeatureGrid />
        <HowItWorks />
        <PortfolioSection />
        <HowWeWorkSection />
        <TierSection />
        <FAQSection />
        <CTASection />
      </main>

      <Footer />
    </div>
  );
}

/* ─────────────────────────────  sections  ───────────────────────────── */

function TopNav() {
  return (
    <nav className="sticky top-0 z-40 backdrop-blur-md bg-white/80 dark:bg-ink-950/80 border-b border-ink-100 dark:border-ink-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2 group" aria-label="IFA home">
          <span className="size-8 rounded-lg bg-ink-900 dark:bg-ink-50 text-white dark:text-ink-900 flex items-center justify-center font-semibold text-xs">
            IFA
          </span>
          <span className="font-semibold tracking-tight text-sm hidden sm:inline">
            Backtest Engine
          </span>
        </a>
        <div className="flex items-center gap-1 sm:gap-4">
          <a href="#features" className="hidden md:inline text-sm text-ink-600 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50">Features</a>
          <a href="#how" className="hidden md:inline text-sm text-ink-600 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50">How it works</a>
          <a href="#portfolio" className="hidden md:inline text-sm text-ink-600 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50">Portfolio</a>
          <a href="#tiers" className="hidden md:inline text-sm text-ink-600 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50">Pricing</a>
          <a href="#faq" className="hidden md:inline text-sm text-ink-600 hover:text-ink-900 dark:text-ink-300 dark:hover:text-ink-50">FAQ</a>
          <Link
            to="/login"
            className="ml-2 inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-ink-900 hover:bg-ink-700 dark:bg-ink-50 dark:hover:bg-white text-white dark:text-ink-900 text-sm font-medium"
          >
            Sign in <ArrowRight size={13}/>
          </Link>
        </div>
      </div>
    </nav>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* soft gradient backdrop */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-70 dark:opacity-40"
        style={{
          background:
            "radial-gradient(1000px 500px at 50% -10%, rgba(124,108,255,0.25), transparent 60%), radial-gradient(600px 300px at 20% 30%, rgba(56,189,248,0.15), transparent 60%)",
        }}
      />
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24 md:py-28 text-center">
        <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-medium bg-accent-600/10 text-accent-700 dark:text-accent-300 border border-accent-600/20 mb-6">
          <LineChart size={11}/> Custom backtests for Indian equities and derivatives
        </span>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-tight">
          Your strategy, backtested by our team.
        </h1>
        <p className="mt-5 text-base sm:text-lg text-ink-600 dark:text-ink-300 max-w-2xl mx-auto leading-relaxed">
          You send us the rulebook. We backtest it on NSE and NFO data,
          hand back the trade log, equity curve, drawdown, and a PDF
          report. Every result is versioned so you can compare runs
          side by side.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <a
            href="mailto:insightfusionanalytics@gmail.com?subject=IFA%20Backtest%20-%20discovery%20call"
            className="inline-flex items-center gap-1.5 h-11 px-5 rounded-xl bg-accent-600 hover:bg-accent-700 text-white text-sm font-medium shadow-sm transition-colors"
          >
            Book a discovery call <ArrowRight size={14}/>
          </a>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 h-11 px-5 rounded-xl border border-ink-200 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-900 text-sm font-medium transition-colors"
          >
            Sign in <Lock size={13}/>
          </Link>
        </div>
        <div className="mt-8 flex items-center justify-center gap-6 text-xs text-ink-500 dark:text-ink-400 flex-wrap">
          <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={12} className="text-emerald-500"/> Isolation-tested engines</span>
          <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={12} className="text-emerald-500"/> Holdout enforced</span>
          <span className="inline-flex items-center gap-1.5"><CheckCircle2 size={12} className="text-emerald-500"/> Audit trail on every result</span>
        </div>
      </div>
    </section>
  );
}

function FeatureGrid() {
  return (
    <section id="features" className="py-16 sm:py-20 border-t border-ink-100 dark:border-ink-900">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">What you get on the platform</h2>
          <p className="mt-3 text-ink-600 dark:text-ink-300">
            Backtest results, strategy history, quotes and delivered
            reports, in one place. Every result is versioned and tied to
            the strategy version and engine that produced it.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="p-6 rounded-2xl border border-ink-200/70 dark:border-ink-800 bg-white dark:bg-ink-900">
              <div className="size-10 rounded-xl bg-accent-600/10 text-accent-700 dark:text-accent-300 flex items-center justify-center mb-4" aria-hidden>
                {f.icon}
              </div>
              <h3 className="text-base font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-1.5 text-sm text-ink-600 dark:text-ink-300 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section id="how" className="py-16 sm:py-20 bg-ink-50/60 dark:bg-ink-900/40 border-y border-ink-100 dark:border-ink-900">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">How it works</h2>
          <p className="mt-3 text-ink-600 dark:text-ink-300">
            Four steps from sign-up to first result. Everything after
            that is iteration: new params, a fresh backtest, or a new
            strategy altogether.
          </p>
        </div>
        <ol className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {STEPS.map((s) => (
            <li key={s.n} className="p-5 rounded-2xl bg-white dark:bg-ink-950 border border-ink-200/70 dark:border-ink-800 flex gap-4">
              <span className="size-9 rounded-xl bg-ink-900 dark:bg-ink-50 text-white dark:text-ink-900 flex items-center justify-center font-semibold text-sm shrink-0">
                {s.n}
              </span>
              <div>
                <h3 className="text-base font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-1 text-sm text-ink-600 dark:text-ink-300 leading-relaxed">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/**
 * "What we've built" — portfolio-style showcase between How it works and
 * Pick your tier. Style matches an Upwork portfolio: category tag, title,
 * one-liner, three bullets of concrete deliverables, and a tag row. Cards
 * with an `href` open the live product in a new tab.
 *
 * Data source is the PORTFOLIO const above. Admin can move this into the
 * content CMS later; for now it's edit-in-code, which keeps the section
 * out of the DB round-trip on every landing-page load.
 */
function PortfolioSection() {
  return (
    <section
      id="portfolio"
      className="py-16 sm:py-20 border-t border-ink-100 dark:border-ink-900"
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-accent-500/10 text-accent-700 dark:text-accent-300 ring-1 ring-inset ring-accent-500/20 mb-3">
            <Rocket size={11} /> Portfolio &amp; products
          </div>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">
            What we've built for our clients
          </h2>
          <p className="mt-3 text-ink-600 dark:text-ink-300">
            Backtest engines, live trading systems, research dashboards and
            bespoke strategy work. Every product below is either shipped and
            running or actively delivered to a paying client.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {PORTFOLIO.map((p) => (
            <article
              key={p.title}
              className="group flex flex-col rounded-2xl border border-ink-200/70 dark:border-ink-800 bg-white dark:bg-ink-900 overflow-hidden hover:shadow-pop transition-shadow"
            >
              <div className="h-32 relative overflow-hidden border-b border-ink-200/70 dark:border-ink-800">
                <PortfolioThumbnail kind={p.kind} />
              </div>

              <div className="p-5 flex flex-col flex-1">
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-ink-500 dark:text-ink-400">
                  {p.category}
                </div>
                <h3 className="mt-1 text-base font-semibold tracking-tight text-ink-900 dark:text-ink-50">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm text-ink-600 dark:text-ink-300 leading-relaxed">
                  {p.body}
                </p>

                <ul className="mt-4 space-y-1.5">
                  {p.deliverables.map((d) => (
                    <li key={d} className="flex items-start gap-2 text-xs text-ink-600 dark:text-ink-300">
                      <CheckCircle2
                        size={13}
                        className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400"
                      />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-4 flex flex-wrap gap-1.5">
                  {p.tags.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-medium bg-ink-100 dark:bg-ink-800 text-ink-600 dark:text-ink-300"
                    >
                      {t}
                    </span>
                  ))}
                </div>

                {p.href && (
                  <a
                    href={p.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-1 text-xs font-medium text-accent-700 dark:text-accent-300 hover:underline"
                  >
                    Visit live <ArrowRight size={12} />
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>

        <p className="mt-10 text-center text-xs text-ink-500 dark:text-ink-400">
          Have a systematic strategy you want backtested or a bespoke engine
          in mind?{" "}
          <Link
            to="/signup"
            className="text-accent-700 dark:text-accent-300 hover:underline font-medium"
          >
            Start a signup →
          </Link>
        </p>
      </div>
    </section>
  );
}

/**
 * How we work with you - servicing-first framing that sits above the
 * tier grid. Anmol's decision 2026-09-08 (audit C3): today IFA delivers
 * every engagement bespoke, priced per scope on Upwork or by direct
 * invoice. Self-serve tiers are on the roadmap and the block below is
 * labelled "Coming soon" so it doesn't clash with the actual servicing
 * flow above.
 */
function HowWeWorkSection() {
  return (
    <section id="how-we-work" className="py-16 sm:py-20 border-t border-ink-100 dark:border-ink-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">How we work with you</h2>
          <p className="mt-3 text-ink-600 dark:text-ink-300">
            Every engagement is scoped as a one-off today. You describe
            what you want backtested, we quote a fixed price and delivery
            window, and you get the results in the portal you're already
            looking at.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {[
            {
              title: "Scope call",
              body: "30 minutes on WhatsApp or Google Meet. You describe the strategy, we ask the questions that make the backtest reproducible.",
            },
            {
              title: "Fixed-price quote",
              body: "Within 2 business days: scope, deliverable, fee and delivery window. Paid on Upwork if you found us there; direct invoice otherwise.",
            },
            {
              title: "Delivery in the portal",
              body: "Trade log, equity curve, drawdown, PDF report - all delivered as an immutable backtest row on your dashboard.",
            },
          ].map((s, i) => (
            <div
              key={s.title}
              className="p-5 rounded-2xl bg-white dark:bg-ink-950 border border-ink-200/70 dark:border-ink-800"
            >
              <div className="size-8 rounded-lg bg-accent-600/10 text-accent-700 dark:text-accent-300 flex items-center justify-center text-sm font-semibold mb-3">
                {i + 1}
              </div>
              <h3 className="text-base font-semibold tracking-tight">{s.title}</h3>
              <p className="mt-2 text-sm text-ink-600 dark:text-ink-300 leading-relaxed">{s.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TierSection() {
  return (
    <section id="tiers" className="py-16 sm:py-20 border-t border-ink-100 dark:border-ink-900 bg-ink-50/60 dark:bg-ink-900/40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full text-[11px] font-semibold uppercase tracking-wider bg-amber-500/15 text-amber-800 dark:text-amber-300 ring-1 ring-inset ring-amber-500/30 mb-4">
            Coming soon
          </span>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Self-serve tiers</h2>
          <p className="mt-3 text-ink-600 dark:text-ink-300">
            Recurring monthly subscriptions with a fixed number of
            backtests, a tuning UI and an SLA. Not launched yet - if any
            of these look right for your workflow, mention it on the
            discovery call and we'll factor it into your scope quote.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {TIERS.map((t) => (
            <div
              key={t.code}
              className={`p-6 rounded-2xl border transition-shadow ${
                t.highlighted
                  ? "border-accent-600/60 dark:border-accent-500/60 bg-white dark:bg-ink-900 shadow-lg ring-1 ring-accent-600/30"
                  : "border-ink-200/70 dark:border-ink-800 bg-white dark:bg-ink-900"
              }`}
            >
              {t.highlighted && (
                <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold bg-accent-600 text-white mb-3">
                  Most popular
                </span>
              )}
              <h3 className="text-xl font-semibold tracking-tight">{t.name}</h3>
              <div className="mt-0.5 text-[11px] uppercase tracking-wider text-ink-500">{t.price}</div>
              <p className="mt-3 text-sm text-ink-600 dark:text-ink-300">{t.tagline}</p>
              <ul className="mt-5 space-y-2">
                {t.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm text-ink-700 dark:text-ink-200">
                    <CheckCircle2 size={14} className="text-emerald-500 mt-0.5 shrink-0" aria-hidden/>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <a
                href={`mailto:insightfusionanalytics@gmail.com?subject=IFA%20Backtest%20-%20${encodeURIComponent(t.name)}%20tier`}
                className={`mt-6 inline-flex items-center justify-center gap-1.5 w-full h-10 rounded-xl text-sm font-medium transition-colors ${
                  t.highlighted
                    ? "bg-accent-600 hover:bg-accent-700 text-white"
                    : "border border-ink-200 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-800"
                }`}
              >
                {t.cta} <ArrowRight size={13}/>
              </a>
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-ink-500 dark:text-ink-400">
          Pricing shared per engagement - Anmol at IFA sends a scope + fee proposal after the discovery call.
        </p>
      </div>
    </section>
  );
}

function FAQSection() {
  return (
    <section id="faq" className="py-16 sm:py-20 border-t border-ink-100 dark:border-ink-900">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-center mb-10">Frequently asked</h2>
        <div className="space-y-3">
          {FAQ.map((f) => (
            <details
              key={f.q}
              className="group p-5 rounded-2xl border border-ink-200/70 dark:border-ink-800 bg-white dark:bg-ink-900 open:shadow-sm"
            >
              <summary className="cursor-pointer flex items-center justify-between gap-3 font-medium">
                <span>{f.q}</span>
                <span className="text-ink-400 group-open:rotate-45 transition-transform text-lg leading-none" aria-hidden>+</span>
              </summary>
              <p className="mt-3 text-sm text-ink-600 dark:text-ink-300 leading-relaxed">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="py-16 sm:py-20 border-t border-ink-100 dark:border-ink-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
        <div className="inline-flex size-14 rounded-2xl bg-accent-600/10 text-accent-700 dark:text-accent-300 items-center justify-center mb-5">
          <Zap size={26} aria-hidden/>
        </div>
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Ready to get your strategy backtested?</h2>
        <p className="mt-3 text-ink-600 dark:text-ink-300 max-w-xl mx-auto">
          A 30-minute call is enough to scope the work, pick a tier, and get a signed proposal within 2 business days.
        </p>
        <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
          <a
            href="mailto:insightfusionanalytics@gmail.com?subject=IFA%20Backtest%20-%20discovery%20call"
            className="inline-flex items-center gap-1.5 h-11 px-5 rounded-xl bg-accent-600 hover:bg-accent-700 text-white text-sm font-medium transition-colors"
          >
            <Mail size={14}/> Email us
          </a>
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 h-11 px-5 rounded-xl border border-ink-200 dark:border-ink-700 hover:bg-ink-50 dark:hover:bg-ink-900 text-sm font-medium transition-colors"
          >
            Sign in <Lock size={13}/>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-ink-100 dark:border-ink-900 py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
        <div className="col-span-2">
          <div className="flex items-center gap-2 mb-3">
            <span className="size-8 rounded-lg bg-ink-900 dark:bg-ink-50 text-white dark:text-ink-900 flex items-center justify-center font-semibold text-xs">
              IFA
            </span>
            <span className="font-semibold tracking-tight">Insight Fusion Analytics</span>
          </div>
          <p className="text-ink-500 dark:text-ink-400 text-xs max-w-sm leading-relaxed">
            Systematic strategy research and delivery for Indian markets. Registered in India. Not investment advice.
          </p>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-ink-500 mb-3">Product</div>
          <ul className="space-y-1.5 text-ink-600 dark:text-ink-300">
            <li><a href="#features" className="hover:text-ink-900 dark:hover:text-ink-50">Features</a></li>
            <li><a href="#how" className="hover:text-ink-900 dark:hover:text-ink-50">How it works</a></li>
            <li><a href="#tiers" className="hover:text-ink-900 dark:hover:text-ink-50">Pricing</a></li>
            <li><Link to="/login" className="hover:text-ink-900 dark:hover:text-ink-50">Sign in</Link></li>
          </ul>
        </div>
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-wider text-ink-500 mb-3">Contact</div>
          <ul className="space-y-1.5 text-ink-600 dark:text-ink-300">
            <li className="min-w-0">
              <a
                href="mailto:insightfusionanalytics@gmail.com"
                className="hover:text-ink-900 dark:hover:text-ink-50 flex items-start gap-1 break-all"
              >
                <Mail size={12} className="mt-0.5 shrink-0" />
                <span className="break-all">insightfusionanalytics@gmail.com</span>
              </a>
            </li>
            <li><span className="inline-flex items-center gap-1"><Users size={12} aria-hidden/> Serving India</span></li>
            <li><span className="inline-flex items-center gap-1"><BarChart3 size={12} aria-hidden/> NSE cash + F&amp;O</span></li>
          </ul>
        </div>
      </div>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 mt-8 pt-6 border-t border-ink-100 dark:border-ink-900 flex items-center justify-between text-xs text-ink-500 flex-wrap gap-2">
        <span>© {new Date().getFullYear()} Insight Fusion Analytics. All rights reserved.</span>
        <span className="inline-flex items-center gap-3">
          <span>Not investment advice - for research purposes only.</span>
        </span>
      </div>
    </footer>
  );
}
