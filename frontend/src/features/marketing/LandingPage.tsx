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
  Layers,
  LineChart,
  Lock,
  Mail,
  Rocket,
  ShieldCheck,
  Sparkles,
  TrendingUp,
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
    title: "One contract, many engines",
    body: "Every engagement declares scope, tier and deliverable up front. The engine your strategy runs on is a first-class object — you always know what version tested what.",
  },
  {
    icon: <LineChart size={22}/>,
    title: "Rich, honest reports",
    body: "Equity curve, drawdown, Sharpe, Sortino, hit-rate, trade log — every result page carries the full picture. PDF export included.",
  },
  {
    icon: <ShieldCheck size={22}/>,
    title: "Holdout enforced",
    body: "You cannot tune on data reserved for out-of-sample validation. The system trims your date range if you try. That's the guardrail against overfitting.",
  },
  {
    icon: <FileCheck2 size={22}/>,
    title: "Every result is auditable",
    body: "Backtests are versioned, immutable, and tied to a strategy version and engine version. Rerun-with-same-params is one click.",
  },
];

const STEPS = [
  {
    n: 1,
    title: "Sign the terms",
    body: "Read and accept IFA's engagement terms — click-signed, timestamped, versioned. If terms are ever updated, you'll be prompted to re-acknowledge.",
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
const PORTFOLIO = [
  {
    icon: <Cpu size={22} />,
    accent: "from-accent-500 to-violet-600",
    category: "Product",
    title: "IFA Backtest Engine",
    body: "The very platform you're on. Serviced client portal + backtest engine, tier-gated with immutable results, an admin console with audit trail, and a per-engagement quote system.",
    deliverables: [
      "Self-serve signup + admin approval flow",
      "Locked v1.0 result schema — every backtest reproducible",
      "Tiered engagements + WhatsApp delivery workflow",
    ],
    tags: ["FastAPI", "React 19", "PostgreSQL", "Firebase Auth"],
    href: "https://backtestingengine.insightfusionanalytics.com",
  },
  {
    icon: <TrendingUp size={22} />,
    accent: "from-emerald-500 to-teal-600",
    category: "Live engine",
    title: "VAM — Volatility Adjusted Momentum",
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
    icon: <LineChart size={22} />,
    accent: "from-sky-500 to-blue-600",
    category: "Strategy research",
    title: "Swing-trading strategy library",
    body: "Ready-to-backtest rulebooks — Alligator + Central Pivot Range, Supertrend + Heikin-Ashi + Fractals, RSI mean-reversion — with clear entries, stops, R-multiples, and holding rules for pullback and breakout setups.",
    deliverables: [
      "Rulebooks in plain English + code",
      "Three entry-timing models per strategy",
      "Backtested across midcaps + Nifty universe",
    ],
    tags: ["Alligator", "CPR", "Supertrend", "Heikin-Ashi", "Fractals"],
  },
  {
    icon: <BarChart3 size={22} />,
    accent: "from-amber-500 to-orange-600",
    category: "Analytics",
    title: "Market Pulse dashboard",
    body: "Live market-breadth and macro dashboard for internal desk use — advance/decline, sector rotation, volatility regime, and open-interest heatmaps rolled up into one view.",
    deliverables: [
      "Real-time NSE breadth ingestion",
      "Sector rotation + heatmap widgets",
      "Publishable snapshots for research notes",
    ],
    tags: ["FastAPI", "WebSockets", "React", "Recharts"],
  },
  {
    icon: <Layers size={22} />,
    accent: "from-fuchsia-500 to-pink-600",
    category: "Custom engagement",
    title: "Bespoke Phase-A universe scanner",
    body: "Company selection module for a swing-trading engagement — ranks a ₹1k-20k crore universe on 3/6/9-month trends, smoothness, higher-highs consistency and quarterly fundamentals, with every setting exposed for admin tuning.",
    deliverables: [
      "Reproducible ranked shortlist per selection date",
      "Adjustable trend + fundamentals filters",
      "Full audit trail on every selection run",
    ],
    tags: ["Python", "yfinance/GDFL", "Pydantic", "Alembic"],
  },
  {
    icon: <ShieldCheck size={22} />,
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

const FAQ = [
  {
    q: "Is this a self-serve SaaS?",
    a: "No — it's a serviced portal. You give us your strategy, we run backtests for you against an engine our team maintains. The dashboard is where you see results, request changes and manage your engagement.",
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
    a: "Yes — brokerage, STT, exchange fees, slippage model per instrument liquidity band. All disclosed in the report footer.",
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
      email: "hello@insightfusionanalytics.com",
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
      name: `${t.name} — ${t.price}`,
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
        title="IFA Backtest Engine — Systematic strategy backtests for Indian markets"
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
          <Sparkles size={11}/> Systematic strategies · Indian markets
        </span>
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-semibold tracking-tight leading-tight">
          Backtests that earn a serious operator&rsquo;s trust.
        </h1>
        <p className="mt-5 text-base sm:text-lg text-ink-600 dark:text-ink-300 max-w-2xl mx-auto leading-relaxed">
          Insight Fusion Analytics runs a hands-on portal for systematic strategy research and delivery.
          You bring the idea; we backtest it on a versioned engine, deliver honest reports, and iterate with you.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
          <a
            href="mailto:hello@insightfusionanalytics.com?subject=IFA%20Backtest%20-%20discovery%20call"
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
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Built like production infrastructure</h2>
          <p className="mt-3 text-ink-600 dark:text-ink-300">
            Every part of the workflow — from engagement to engine to results — is versioned, auditable, and honest about its guardrails.
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
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">How the engagement flows</h2>
          <p className="mt-3 text-ink-600 dark:text-ink-300">
            Four steps from signature to results. Everything after step 4 is iteration — new backtests, new params, or a new engine altogether.
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
              <div
                className={`h-32 bg-gradient-to-br ${p.accent} flex items-center justify-center relative overflow-hidden`}
                aria-hidden
              >
                {/* Subtle grid backdrop so the gradient reads as "product art"
                    instead of a solid colour block. */}
                <div
                  className="absolute inset-0 opacity-15"
                  style={{
                    backgroundImage:
                      "linear-gradient(to right, rgba(255,255,255,.35) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,.35) 1px, transparent 1px)",
                    backgroundSize: "24px 24px",
                  }}
                />
                <div className="size-14 rounded-2xl bg-white/25 backdrop-blur-sm text-white flex items-center justify-center ring-1 ring-white/40 shadow-lg relative">
                  {p.icon}
                </div>
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

function TierSection() {
  return (
    <section id="tiers" className="py-16 sm:py-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="max-w-2xl mx-auto text-center mb-12">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Pick your tier</h2>
          <p className="mt-3 text-ink-600 dark:text-ink-300">
            All engagements come with terms, T&amp;C, versioned engines and an audit log. Tiers change how many backtests, how tight the SLA, and whether we build a bespoke engine for your family.
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
                href={`mailto:hello@insightfusionanalytics.com?subject=IFA%20Backtest%20-%20${encodeURIComponent(t.name)}%20tier`}
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
          Pricing shared per engagement — Anmol at IFA sends a scope + fee proposal after the discovery call.
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
        <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">Ready to see your strategy tested honestly?</h2>
        <p className="mt-3 text-ink-600 dark:text-ink-300 max-w-xl mx-auto">
          A 30-minute discovery call is enough to scope your engagement, pick a tier, and get a signed proposal within 2 business days.
        </p>
        <div className="mt-7 flex items-center justify-center gap-3 flex-wrap">
          <a
            href="mailto:hello@insightfusionanalytics.com?subject=IFA%20Backtest%20-%20discovery%20call"
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
                href="mailto:hello@insightfusionanalytics.com"
                className="hover:text-ink-900 dark:hover:text-ink-50 flex items-start gap-1 break-all"
              >
                <Mail size={12} className="mt-0.5 shrink-0" />
                <span className="break-all">hello@insightfusionanalytics.com</span>
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
          <span>Not investment advice — for research purposes only.</span>
        </span>
      </div>
    </footer>
  );
}
