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
  ShieldCheck,
  Sparkles,
  Users,
  Zap,
} from "lucide-react";
import SEOHead from "../../components/SEOHead";

const SITE = "https://backtestingengine.insightfusionanalytics.com";

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
        <div>
          <div className="text-xs uppercase tracking-wider text-ink-500 mb-3">Contact</div>
          <ul className="space-y-1.5 text-ink-600 dark:text-ink-300">
            <li><a href="mailto:hello@insightfusionanalytics.com" className="hover:text-ink-900 dark:hover:text-ink-50 inline-flex items-center gap-1"><Mail size={12}/> hello@insightfusionanalytics.com</a></li>
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
