/**
 * Hardcoded fallback content. Every field also has a copy on the backend
 * (services/content.DEFAULTS) — the client uses THESE when the /content
 * endpoint hasn't loaded yet or fails. Keep the two in sync when adding
 * or renaming fields.
 */

export type OnboardingStep = {
  key: string;
  title: string;
  hint_todo: string;
  hint_done: string;
};

export type TierFeatures = {
  tagline: string;
  features_included: string[];
};

export type PlaceholderTile = {
  title: string;
  subtitle: string;
  badge: string;
};

export type Announcement = {
  visible: boolean;
  kind: "info" | "warning" | "success";
  headline: string;
  body: string;
  cta_label: string;
  cta_url: string;
};

export type SectionVisibility = {
  welcome_banner: boolean;
  onboarding_checklist: boolean;
  tier_card: boolean;
  stat_tiles: boolean;
  placeholder_tiles: boolean;
  latest_backtests: boolean;
  support_footer: boolean;
  announcement: boolean;
};

export type ContentDoc = {
  welcome: {
    headline: string;
    body: string;
    primary_cta_label: string;
    secondary_cta_label: string;
  };
  tier_card: {
    tier1: TierFeatures;
    tier2: TierFeatures;
    tier3: TierFeatures;
    upgrade_cta_label: string;
  };
  onboarding: { steps: OnboardingStep[] };
  placeholder_tiles: {
    ai: PlaceholderTile;
    optimiser: PlaceholderTile;
    billing: PlaceholderTile;
  };
  support_footer: { hours: string; email: string; copyright: string };
  announcement: Announcement;
  sections: SectionVisibility;
};

export const CONTENT_DEFAULTS: ContentDoc = {
  welcome: {
    headline: "Welcome to the IFA Backtest Engine",
    body: "We've preloaded a demo backtest so you can explore the full report view. When you're ready, upload your first strategy document or open a new request.",
    primary_cta_label: "Open demo report",
    secondary_cta_label: "Upload strategy",
  },
  tier_card: {
    tier1: {
      tagline: "Perfect for validating one strategy at a time.",
      features_included: [
        "Client dashboard + strategy library",
        "1 backtest / month (delivered by IFA)",
        "PDF report export",
        "Legal-disclaimer-embedded delivery",
        "Terms & Conditions acceptance flow",
      ],
    },
    tier2: {
      tagline: "For teams shipping multiple strategies with self-serve access.",
      features_included: [
        "Everything in Starter",
        "5 backtests / month",
        "Run VAM engine directly from the portal",
        "Parameter overrides on the engine step picker",
        "Priority email support (24h SLA)",
        "Benchmark comparison against S&P 500 / NIFTY 50 / BTC",
      ],
    },
    tier3: {
      tagline: "For firms who need custom research + SLA-backed delivery.",
      features_included: [
        "Everything in Growth",
        "Unlimited backtests",
        "Custom strategy engineering",
        "Optimisation runs (v2 coming)",
        "Dedicated slack channel + phone support",
        "MSA / DPA / annual audit letters",
      ],
    },
    upgrade_cta_label: "Talk to us",
  },
  onboarding: {
    steps: [
      { key: "tnc",      title: "Accept the Terms & Conditions",              hint_todo: "Read + accept the engagement terms so we can start work.",   hint_done: "Signed and stored." },
      { key: "demo",     title: "Explore the demo backtest",                  hint_todo: "See the exact report format your strategies will land in.",  hint_done: "Explored." },
      { key: "strategy", title: "Upload your first strategy document",        hint_todo: "PDF / DOCX / TXT. Up to 25 MB. Versioned for you.",          hint_done: "Nice - locked in as source of truth." },
      { key: "request",  title: "Open your first request",                    hint_todo: "New strategy / change request / RFQ / clarification - any of the four.", hint_done: "In our queue - we'll reach out." },
      { key: "backtest", title: "Review your first delivered backtest",       hint_todo: "We'll email you when it's ready. Turnaround per your plan's SLA.",  hint_done: "Read the metrics, export the PDF." },
    ],
  },
  placeholder_tiles: {
    ai:        { title: "AI Analyst",           subtitle: "Ask questions about your backtest in plain English.",     badge: "Growth" },
    optimiser: { title: "Parameter optimiser",  subtitle: "Automated grid + walk-forward on your strategy.",         badge: "Enterprise" },
    billing:   { title: "Auto-billing",         subtitle: "Manage plan, invoices, and payment methods.",             badge: "Soon" },
  },
  support_footer: {
    hours: "10 AM – 7 PM IST · Mon–Fri",
    email: "insightfusionanalytics@gmail.com",
    copyright: "© Insight Fusion Analytics · Backtest Engine v1.0",
  },
  announcement: {
    visible: false,
    kind: "info",
    headline: "",
    body: "",
    cta_label: "",
    cta_url: "",
  },
  sections: {
    welcome_banner: true,
    onboarding_checklist: true,
    tier_card: true,
    stat_tiles: true,
    placeholder_tiles: true,
    latest_backtests: true,
    support_footer: true,
    announcement: true,
  },
};
