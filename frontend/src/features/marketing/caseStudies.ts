/**
 * Case studies shown in the landing page's portfolio section.
 *
 * Client names are deliberately withheld: `client` is a generic descriptor, and
 * copy describes what was built, never trading performance. Plain hyphens only
 * (the site's copy has no em-dashes). To add one, append an entry and, if it
 * needs a new picture, a `kind` case in CaseStudyThumbnail.tsx.
 */

export type CaseStudyKind =
  | "market-making"
  | "smart-routing"
  | "stat-arb"
  | "liquidity-provision"
  | "cross-exchange"
  | "mev-defi"
  | "deep-portfolio"
  | "nautilus-platform"
  | "optimisation"
  | "strategy-dashboard"
  | "backtest-engine"
  | "vam-engine"
  | "strategy-library"
  | "market-pulse"
  | "universe-scanner"
  | "admin-console";

export type CaseStudyCategory = "execution" | "arbitrage" | "research" | "allocation" | "systems";

export const CATEGORY_LABEL: Record<CaseStudyCategory, string> = {
  execution: "Market making & execution",
  arbitrage: "Arbitrage",
  research: "Backtesting & research",
  allocation: "Portfolio & allocation",
  systems: "Live systems & platforms",
};

export type CaseStudy = {
  slug: string;
  kind: CaseStudyKind;
  category: CaseStudyCategory;
  /** Anonymised descriptor of who it was for. Never a real client name. */
  client: string;
  title: string;
  /** Card copy: one or two sentences. */
  summary: string;
  challenge: string;
  built: string[];
  /** Heading for `outcomes`. Defaults to "Outcome"; use something else when the
   *  entries are deliverables rather than results. */
  outcomeLabel?: string;
  outcomes: string[];
  stack: string[];
  /** Live URL, when the product is public. */
  href?: string;
};

export const CASE_STUDIES: CaseStudy[] = [
  {
    slug: "crypto-market-making",
    kind: "market-making",
    category: "execution",
    client: "Proprietary trading firm, Europe",
    title: "Low-latency crypto market making",
    summary:
      "A full-stack market-making system for BTC and ETH, from market data ingestion to execution, with a hot path of about 12 ms.",
    challenge:
      "The firm wanted to quote continuously on liquid crypto markets, hold good queue position and keep inventory risk in check through volatile sessions. That called for one system spanning market data, research and execution, fast enough on the hot path to keep its quotes competitive.",
    built: [
      "Market-making algorithm that uses predictive models to hold queue position and execution priority in the order book",
      "Inventory-aware quoting: quotes and exposure adjust to live market conditions",
      "Execution across several major exchanges with cross-venue optimisation, plus option-based hedging to keep directional and volatility exposure balanced",
      "Fault-tolerant ingestion pipelines on a 10 to 100 ms cadence across 8+ exchanges",
      "Partitioned PostgreSQL storage with automated archival to S3, built for consistent ingestion and fast queries over large market datasets",
      "Trading engine with a hot path of about 12 ms, performance-critical components in C++ with Python around them",
      "Smart order routing to limit slippage and market impact, FIX connectivity, and colocation set up together with exchange teams",
      "Distributed model training on PySpark, so research and retraining scale to terabyte-sized datasets",
    ],
    outcomes: [
      "Strategies run continuously with high uptime through volatile markets",
      "Data, research and execution built as one system rather than stitched together",
      "Latency work covered infrastructure placement, network tuning and exchange-level benchmarking",
    ],
    stack: ["C++", "Python", "PostgreSQL", "PySpark", "FIX", "S3"],
  },
  {
    slug: "smart-order-routing",
    kind: "smart-routing",
    category: "execution",
    client: "Digital asset investment firm",
    title: "Cross-exchange smart order routing",
    summary:
      "A consolidated order book and routing engine that works large orders across fragmented crypto liquidity with minimal market impact.",
    challenge:
      "Large OTC and programmatic orders move the price when they hit a single venue, and crypto liquidity is split across many. The firm needed one view of depth across exchanges and an execution layer that could work an order across all of them.",
    built: [
      "Consolidated order book engine: unified depth across venues, liquidity fragmentation analysis and execution path optimisation",
      "Routing logic for venue selection, order slicing, and how capital and inventory are spread across exchanges",
      "Staggered execution: parent orders split into child orders, worked on several venues at once and adapted to live liquidity",
      "Impact controls: liquidity-aware execution, adaptive participation rates and spread-sensitive order placement",
      "Handling for partial fills and re-routing, with slippage tracked against benchmark prices",
      "Pre-positioning and rebalancing of balances across exchanges, weighing transfer latency and cost against idle capital",
      "Microstructure-aware decisions: depth and imbalance, spread dynamics and basic adverse selection avoidance",
      "Execution analytics and live monitoring: slippage against arrival price, execution quality by venue and order lifecycle metrics",
      "Exchange-level redundancy, failover routing and recovery built into the execution path",
    ],
    outcomes: [
      "A production execution engine for large notional orders, with lower market impact and better execution quality than naive market taking",
      "Institutional-style OTC execution workflows on top of aggregated liquidity",
      "A base for further work on adaptive routing and liquidity-aware execution",
    ],
    stack: ["C++", "Python", "Event-driven architecture", "Real-time market data"],
  },
  {
    slug: "stat-arb-platform",
    kind: "stat-arb",
    category: "arbitrage",
    client: "Multi-strategy trading group",
    title: "Statistical arbitrage and pairs trading platform",
    summary:
      "A production platform that selects pairs, runs many spread strategies in parallel and manages their risk.",
    challenge:
      "One pairs strategy can live in a script. Many of them, each with its own lifecycle and capital, need pair selection, orchestration and risk control built as a platform.",
    built: [
      "Dynamic pair selection using correlation and cointegration models, regime detection and spread stability analysis",
      "Strategy runners and an orchestration layer: many pair strategies in parallel, each with its own lifecycle and capital allocation",
      "Adaptive signals: spread normalisation, volatility-aware entry and exit thresholds and real-time recalibration",
      "Large-scale backtesting on historical data before anything reaches production",
      "Low-latency execution in C++ and Python for efficient spread capture and minimal slippage",
      "Risk layer with exposure balancing across pairs, capital allocation and drawdown controls",
    ],
    outcomes: [
      "A production-grade platform designed to scale to many strategies at once",
      "Every pair strategy validated in backtest, then run with its own capital and risk limits",
    ],
    stack: ["C++", "Python", "Cointegration", "Backtesting"],
  },
  {
    slug: "gulf-liquidity-provision",
    kind: "liquidity-provision",
    category: "execution",
    client: "Financial services group, Gulf region",
    title: "Liquidity provision on a Gulf equity exchange",
    summary:
      "A market-making system that keeps two-sided quotes in the market and reports the metrics the exchange measures, built to move onto full market data later.",
    challenge:
      "The exchange offered limited API access and no full order book feed, yet the market-making role came with obligations on presence, spread and displayed liquidity. The system had to start quoting early with what was available, and be ready to move onto proper market data without a rebuild.",
    built: [
      "Market-making engine: continuous two-sided quoting, spreads that widen and narrow with volatility regimes, inventory-driven quote skew and conservative handling of adverse selection when depth is limited",
      "Inventory risk controls: live exposure tracking, hard and soft limits, automated safety controls, exposure decay and rebalancing",
      "Volatility forecasting and regime detection to adapt quoting to market conditions",
      "Hybrid setup: a broker API for execution and level-1 data, plus a manual 10-level order book input dashboard feeding the strategy in real time",
      "Recording pipeline for quotes, trades, book snapshots, strategy quotes, executions and inventory, stored as time series for calibration and reporting",
      "Execution layer with order placement, modification and cancellation, reconciliation, reconnection and rate-limit handling",
      "KPI tracking against the exchange's market-making requirements: presence ratio, share of displayed liquidity, spread contribution, executed against quoted volume, inventory variance and exposure half-life",
      "Monitoring and alerting on strategy health, data freshness, inventory breaches and connectivity failures",
    ],
    outcomes: [
      "Participation in the market without waiting for native exchange API access",
      "A migration path designed in from the start: manual book to real level-2 data, broker API to native exchange access, and on to a fully automated, queue-aware market maker",
    ],
    stack: ["Interactive Brokers API", "C++", "Python", "WebSocket / REST", "Time-series storage"],
  },
  {
    slug: "cross-exchange-arbitrage",
    kind: "cross-exchange",
    category: "arbitrage",
    client: "Multi-strategy trading group",
    title: "Cross-exchange and market-neutral arbitrage",
    summary:
      "Arbitrage systems that capture price gaps between exchanges, and between exchanges and on-chain venues.",
    challenge:
      "Price gaps between venues close quickly and shrink once latency, slippage and the cost of moving assets are counted. The systems had to place orders fast and keep capital balanced across venues.",
    built: [
      "Arbitrage systems for centralised exchange to exchange and exchange to DEX opportunities",
      "Handling for the practical problems: latency differences, slippage and market impact, fragmented liquidity and rebalancing assets between venues",
      "Execution engines in C++ and Python built for fast order placement, efficient use of capital and lower execution risk",
      "Real-time monitoring and control for P&L, execution quality and strategy health",
      "Infrastructure behind a DMZ to protect trading credentials and systems",
    ],
    outcomes: [
      "Deployed systems capturing cross-venue price inefficiencies, with live P&L and execution quality monitoring",
      "Trading credentials and systems isolated from the public network",
    ],
    stack: ["C++", "Python", "CEX and DEX connectivity", "DMZ network design"],
  },
  {
    slug: "mev-defi-arbitrage",
    kind: "mev-defi",
    category: "arbitrage",
    client: "Multi-strategy trading group",
    title: "MEV and DeFi arbitrage on multiple chains",
    summary:
      "On-chain arbitrage, liquidation and routing bots with their own smart contracts and self-run nodes.",
    challenge:
      "On-chain opportunities are contested and short lived, gas cost decides whether a trade is worth taking, and liquidity is scattered across DEXs and chains.",
    built: [
      "MEV bots targeting arbitrage, liquidations and inefficient routing across on-chain liquidity",
      "DeFi arbitrage systems working across multiple DEXs and fragmented liquidity pools",
      "Solidity smart contracts for automated arbitrage execution, optimal routing and trade settlement",
      "Multi-chain coverage: Ethereum, BSC, Polygon, Avalanche and Cronos",
      "Gas-aware execution that optimises transaction timing and cost",
      "C++ and Python execution stack for a fast response to on-chain opportunities",
      "Validator and full nodes run in house for reliability and uptime",
    ],
    outcomes: [
      "Bots and contracts deployed across five chains",
      "Node infrastructure run directly, for the reliability the strategies needed",
    ],
    stack: ["Solidity", "C++", "Python", "EVM chains", "Validator nodes"],
  },
  {
    slug: "ai-portfolio-allocation",
    kind: "deep-portfolio",
    category: "allocation",
    client: "Asset management firm",
    title: "AI-driven portfolio allocation",
    summary:
      "A neural network built so the network is the portfolio: each node is an asset, and the learned weights are the allocation.",
    challenge:
      "Static allocations do not adapt when market regimes change. The firm wanted long-term allocations learned from data and expressed as weights it could deploy, with rebalancing that did not churn the portfolio.",
    built: [
      "Custom neural network framework based on Deep Portfolio Theory (Heaton, Polson and Witte, 2017): nodes map to assets, and inter-layer weights map to allocation decisions",
      "End-to-end training on historical returns to learn allocations across market regimes",
      "Custom objective function covering risk-adjusted return, volatility penalty, drawdown sensitivity and capital efficiency constraints",
      "Model output turned directly into deployable portfolio weights",
      "Rebalancing engine with threshold, time-based and hybrid triggers, drift detection and correction, and controls on turnover and transaction costs",
      "Data pipelines for ingestion, preprocessing and feature engineering, with backtesting and simulation across regimes to test stability and sensitivity to parameters",
    ],
    outcomes: [
      "A model-driven allocation framework that adapts as market conditions change, as an alternative to static weights",
      "A modular pipeline from training to allocation to execution",
      "A base for adding shorter-horizon signals and hybrid systematic strategies",
    ],
    stack: ["Python", "C++", "Deep learning", "Portfolio optimisation"],
  },
  {
    slug: "nautilus-backtesting-platform",
    kind: "nautilus-platform",
    category: "research",
    client: "Systematic options trader, India",
    title: "Backtesting platform on NautilusTrader",
    summary:
      "A Nautilus-based backtester with an options mapping layer, an Optuna optimiser and a research dashboard, delivered together with its first strategy.",
    challenge:
      "The trader's intraday VWAP-bounce strategy existed as a Pine Script. It needed a Python version that could be tested properly against tick data, priced as index options trades under the trader's own strike and expiry rules, and a base that other strategies could plug into later.",
    built: [
      "The Pine Script strategy ported to Python: VWAP bounce and rejection, RSI and volume filters, session rules, stop loss, take profit and an end-of-day flat rule",
      "NautilusTrader backtest engine with order, cost and slippage simulation, run in isolated processes, alongside a reference engine used for cross-validation",
      "Data adapter for client-provided historical data: load, normalise and validate",
      "Options mapping: strike selection (ATM, ITM or OTM with offsets), expiry selection (this or next week, this or next month), call and put price lookup, and option P&L with brokerage",
      "Everything configurable through YAML files and a schema-driven UI, so parameters change without touching code",
      "Optuna optimiser with TPE, random and CMA-ES samplers, pruning on minimum trades and maximum drawdown, resumable studies and best-parameter export",
      "FastAPI and React dashboard: run summary, equity and drawdown curves, monthly P&L, trade log, optimisation results, and HTML, CSV and Excel exports",
    ],
    outcomes: [
      "A second strategy, an EMA crossover, added to the same engine, UI and optimiser with a config file and one registry line, showing the foundation is reusable",
      "87 automated logic tests covering signals, the backtest engine, options P&L, metrics and config loading",
    ],
    stack: ["NautilusTrader", "Optuna", "FastAPI", "React", "Pydantic"],
  },
  {
    slug: "holdout-validated-optimisation",
    kind: "optimisation",
    category: "research",
    client: "Systematic options trader, US",
    title: "Holdout-validated parameter optimisation",
    summary:
      "A parameter search designed around its own falsification: independent holdouts, written kill criteria and a go or no-go at the end.",
    challenge:
      "A profitable intraday options strategy with a hand-built scoring formula and thin margins. The question was whether re-weighting the formula and tuning its exits could improve it, or whether tuning was exhausted, and how to answer that without fooling ourselves with in-sample fits. An earlier attempt at machine-learned exits had not held up on held-out data, so the standard was set accordingly.",
    built: [
      "Pre-flight check: confirm the ranking of signal quality (information coefficient) replicates across independent windows before any optimisation runs. If it shuffles, stop",
      "Data path audit, so the analysis runs on the corrected pipeline rather than stale data",
      "Entry scoring weights fit with constrained least squares (CVXPY), a learned monotonic rank transform (isotonic regression) as an alternative, and thresholds and gates tuned with Optuna",
      "Exit logic searched across eight structures, from a plain timer to triple-barrier, ranked on holdout data rather than in-sample",
      "Three-segment walk-forward split plus two cross-regime holdout windows. A configuration only counts if it beats the baseline on all three holdouts",
      "Kill criteria written down before the run: failed replication, degraded holdout, a gain within noise, or exit results that disagree across windows",
    ],
    outcomeLabel: "What the client receives",
    outcomes: [
      "Full trial history for every study as CSV, and the best validated configuration as JSON",
      "A written report covering the pre-flight result, fitted against current weights, and results on all three holdouts",
      "A go or no-go recommendation. Either answer is useful: a validated configuration, or evidence that tuning is exhausted and the next step is structural",
    ],
    stack: ["CVXPY", "Optuna", "Isotonic regression", "Walk-forward validation"],
  },
  {
    slug: "strategy-monitoring-dashboard",
    kind: "strategy-dashboard",
    category: "systems",
    client: "Systematic options trader, US",
    title: "Live strategy monitoring dashboard",
    summary:
      "A dense single-page dashboard that ties every strategy release to the days it ran, so a change in results can be traced to a deploy.",
    challenge:
      "When a live strategy is tuned often, a P&L number is not enough. What matters is which version was running on which day, and whether a change in results lines up with a release.",
    built: [
      "KPI strip: today, month-to-date and total P&L, win rate, Sharpe and Sortino, and max drawdown",
      "26-week calendar heatmap of daily P&L, with a tooltip per day showing P&L, trade count and strategy version",
      "Cumulative equity curve with strategy-version deploy markers",
      "Version history showing what changed in each release and its P&L delta",
      "Today's trades with entry, exit, quantity and P&L, and a live market-hours status",
      "Designed to read straight from the strategy's own log files, in a dark, dense layout made for reading at a glance",
    ],
    outcomes: [
      "Every day's P&L, trade count and strategy version visible in a single hover",
      "Release history and equity curve on the same page, so cause and effect can be checked quickly",
    ],
    stack: ["JavaScript", "SVG", "JSONL logs"],
  },
  {
    slug: "vam-engine",
    kind: "vam-engine",
    category: "systems",
    client: "In-house engine",
    title: "VAM: Volatility Adjusted Momentum",
    summary:
      "A live momentum engine for Indian equities that scores momentum net of volatility and sizes positions inversely to realised risk.",
    challenge:
      "The same momentum signal deserves less capital in a volatile stock than in a calm one. The engine had to score momentum net of volatility and size every position to match, live.",
    built: [
      "Proprietary volatility-adjusted momentum score",
      "Position sizing that scales inversely to realised risk",
      "Real-time signal generation and broker routing",
      "Parameter-tuning UI for approved clients",
      "Live dashboard streaming equity and drawdown",
    ],
    outcomes: [
      "Running live on Indian equities",
      "Approved clients tune parameters themselves through the portal",
    ],
    stack: ["Python", "NumPy / pandas", "TradingView data", "Zerodha Kite"],
    href: "https://backtestravi.insightfusionanalytics.com",
  },
  {
    slug: "ifa-backtest-engine",
    kind: "backtest-engine",
    category: "systems",
    client: "In-house product",
    title: "IFA Client Portal",
    summary:
      "The client portal you are on: tier-gated backtests with immutable results, an admin console with an audit trail, and per-engagement quotes.",
    challenge:
      "Clients need backtest results they can rely on months later, and a delivery process that shows who did what. Results had to be locked once delivered, and every engagement had to be scoped, quoted and tracked in one place.",
    built: [
      "Self-serve signup with an admin approval step",
      "Locked v1.0 result schema, so every backtest is reproducible",
      "Tiered engagements with a WhatsApp delivery workflow",
      "Admin console with an audit trail",
      "Per-engagement quote system",
    ],
    outcomes: [
      "Every backtest is an immutable, reproducible record",
      "Shipped and in use with clients",
    ],
    stack: ["FastAPI", "React 19", "PostgreSQL", "Firebase Auth"],
    href: "https://backtestingengine.insightfusionanalytics.com",
  },
  {
    slug: "swing-strategy-library",
    kind: "strategy-library",
    category: "research",
    client: "Swing-trading research",
    title: "Swing-trading strategy library",
    summary:
      "Ready-to-backtest rulebooks for pullback and breakout setups, written precisely enough to code and test.",
    challenge:
      "Discretionary swing setups are hard to test because the rules live in someone's head. Each one had to be written down with clear entries, stops and holding rules before it could be backtested.",
    built: [
      "Rulebooks for Alligator with Central Pivot Range, Supertrend with Heikin-Ashi and Fractals, and RSI mean reversion",
      "Entries, stops, R-multiples and holding rules for pullback and breakout setups",
      "Each rulebook in plain English and in code",
      "Three entry-timing models per strategy",
    ],
    outcomes: ["Backtested across midcaps and the Nifty universe"],
    stack: ["Alligator", "CPR", "Supertrend", "Heikin-Ashi", "Fractals"],
  },
  {
    slug: "universe-scanner",
    kind: "universe-scanner",
    category: "research",
    client: "Bespoke engagement, swing trading",
    title: "Universe scanner for swing trading",
    summary:
      "Ranks a ₹1k-20k crore universe on trend, smoothness and fundamentals, with every setting exposed for tuning.",
    challenge:
      "A swing-trading engagement needed a shortlist it could explain and repeat: the same inputs on the same selection date should always give the same ranked list.",
    built: [
      "Ranking on 3, 6 and 9 month trends, smoothness, higher-highs consistency and quarterly fundamentals",
      "Adjustable trend and fundamentals filters, all exposed for admin tuning",
      "Reproducible ranked shortlist for each selection date",
      "Full audit trail on every selection run",
    ],
    outcomes: ["A repeatable, auditable selection process in place of an ad hoc screen"],
    stack: ["Python", "yfinance / GDFL", "Pydantic", "Alembic"],
  },
  {
    slug: "market-pulse-dashboard",
    kind: "market-pulse",
    category: "systems",
    client: "Internal desk tool",
    title: "Market Pulse dashboard",
    summary:
      "Breadth, sector rotation, volatility and open interest in one live view for a trading desk.",
    challenge:
      "Breadth, sector rotation, volatility regime and open interest normally sit on different screens. The desk wanted one view, and a way to publish from it.",
    built: [
      "Real-time NSE breadth ingestion",
      "Advance/decline, sector rotation and volatility regime widgets",
      "Open interest heatmaps",
      "Publishable snapshots for research notes",
    ],
    outcomes: ["One live view for internal desk use, with snapshots that go straight into a research note"],
    stack: ["FastAPI", "WebSockets", "React", "Recharts"],
  },
  {
    slug: "terms-audit-admin-console",
    kind: "admin-console",
    category: "systems",
    client: "In-house platform",
    title: "Terms, audit and admin console",
    summary:
      "Signed, timestamped actions, versioned terms and a live content editor for a serviced platform.",
    challenge:
      "A serviced platform has to show who did what, and which version of the terms each person agreed to.",
    built: [
      "Every action signed by a user and timestamped",
      "Version-locked terms with click-signed acceptance and a per-user acceptance ledger",
      "Append-only audit log with IP and actor",
      "Inbox for pending review items",
      "Content editor with a live preview",
    ],
    outcomes: ["A complete record of actions and acceptances that can be answered from one place"],
    stack: ["Alembic migrations", "Row-level access", "Signed URLs"],
  },
];
