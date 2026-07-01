import axios, { type AxiosError } from "axios";
import { signOut } from "firebase/auth";
import { auth } from "./firebase";

// ── Base URL resolution ────────────────────────────────────────────────────
// In dev (Vite serves with import.meta.env.DEV === true) we fall back to
// localhost so `npm run dev` Just Works. In a production build the env var
// MUST be set at build time — silently shipping a bundle that points at
// http://localhost:8000 would 100% break for every real user (mixed-content
// blocked on https, connection-refused everywhere else). See sweep finding #4.
function resolveBaseURL(): string {
  const v = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim();
  if (v) return v;
  if (import.meta.env.DEV) return "http://localhost:8000/api/v1";
  throw new Error(
    "VITE_API_BASE_URL is not set. This is a production build — refusing " +
      "to silently fall back to localhost. Set the env var at build time " +
      "(Vercel project / docker-compose build args) and rebuild.",
  );
}

export const api = axios.create({ baseURL: resolveBaseURL() });

// ── Auth header injection ──────────────────────────────────────────────────
// Firebase's getIdToken() auto-refreshes when the token is within 5 min of
// expiry, so we don't need our own refresh logic on top.
api.interceptors.request.use(async (config) => {
  const user = auth.currentUser;
  if (user) {
    const token = await user.getIdToken();
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: auth-failure handling ────────────────────────────
// On 401 we tear down the session client-side so the user is bounced back to
// /login instead of seeing a generic "Network Error" from whichever component
// triggered the request. See sweep finding #2.
//
// The handler must be wired LATER (after `useAuth` is defined) — the store
// import here would create a cycle. We expose `installAuthFailureHandler`
// for the auth store to call once it's ready (see store/auth.ts).
let onAuthFailure: (() => void) | null = null;
export function installAuthFailureHandler(fn: () => void) {
  onAuthFailure = fn;
}

api.interceptors.response.use(
  (r) => r,
  async (err: AxiosError) => {
    const status = err.response?.status;
    if (status === 401) {
      // Only sign out + bounce on a TRUE 401 (token expired / revoked / no
      // Firebase user). Other 4xx (403 suspended, 404 not provisioned) leave
      // the session intact so the page can render a meaningful error state.
      try { await signOut(auth); } catch { /* ignore */ }
      if (onAuthFailure) onAuthFailure();
    }
    return Promise.reject(err);
  },
);

// ── Error helpers used by callers ──────────────────────────────────────────
// Distinguishes the three "fetchMe failed" cases the sweep called out
// (finding #3): 401 = unauthenticated (sign-out happens above), 403 =
// suspended, 404 = not provisioned, 5xx / network = backend transient.
export type AuthGateReason =
  | "unauthenticated"
  | "not_provisioned"
  | "suspended"
  | "backend_unavailable"
  | "unknown";

export function classifyAuthGateError(e: unknown): AuthGateReason {
  if (!e || typeof e !== "object" || !("isAxiosError" in e)) return "unknown";
  const ax = e as AxiosError;
  const s = ax.response?.status;
  if (s === 401) return "unauthenticated";
  if (s === 403) return "suspended";
  if (s === 404) return "not_provisioned";
  if (s && s >= 500) return "backend_unavailable";
  if (!ax.response) return "backend_unavailable";  // network error, no response
  return "unknown";
}

export type Me = {
  id: string;
  email: string;
  role: "client" | "sub_admin" | "main_admin";
  status: "active" | "suspended";
  client: {
    id: string;
    name: string;
    tier: string;
    status: string;
    vam_enabled?: boolean;
  } | null;
  needs_tnc_acceptance: boolean;
  latest_tnc_version_id: string | null;
  /** True when this user's client is allowed to run VAM-engine backtests. */
  vam_enabled: boolean;
};

export async function fetchMe(): Promise<Me> {
  const res = await api.get<Me>("/me");
  return res.data;
}

export type TermsClause = { id: string; title: string; body: string; required: boolean };
export type Terms = {
  id: string;
  version: string;
  body: string;
  clauses: TermsClause[];
  effective_from: string;
};

export async function fetchTerms(): Promise<Terms> {
  const res = await api.get<Terms>("/terms/current");
  return res.data;
}

export async function acceptTerms(version_id: string, accepted_clauses: string[]) {
  const res = await api.post<{ ok: boolean; acceptance_id: string }>("/terms/accept", {
    version_id,
    accepted_clauses,
  });
  return res.data;
}

// ── Strategies ──────────────────────────────────────────────────
export type Strategy = {
  id: string;
  name: string;
  version: number;
  storage_key: string;
  size_bytes: number | null;
  mime_type: string | null;
  is_source_of_truth: boolean;
  status: string;
  uploaded_at: string;
};

export async function fetchStrategies(): Promise<Strategy[]> {
  const res = await api.get<Strategy[]>("/strategies");
  return res.data;
}

export type StrategyUploadInit = {
  upload_id: string;
  storage_key: string;
  signed_url: string;
  token: string | null;
  expires_in: number;
};

export async function initStrategyUpload(args: {
  name: string;
  filename: string;
  size_bytes: number;
  mime_type: string;
}): Promise<StrategyUploadInit> {
  const res = await api.post<StrategyUploadInit>("/strategies/upload", args);
  return res.data;
}

export async function finalizeStrategyUpload(upload_id: string, checksum: string): Promise<Strategy> {
  const res = await api.post<{ ok: boolean; strategy: Strategy }>(
    `/strategies/${upload_id}/finalize`,
    { checksum }
  );
  return res.data.strategy;
}

// ── Requests ────────────────────────────────────────────────────
export type RequestType = "new_strategy" | "change" | "quote" | "clarification";
export type ClientRequest = {
  id: string;
  type: RequestType;
  status: string;
  payload: Record<string, unknown>;
  strategy_id: string | null;
  submitted_at: string;
};

export async function fetchRequests(): Promise<ClientRequest[]> {
  const res = await api.get<ClientRequest[]>("/requests");
  return res.data;
}

export async function submitRequest(args: {
  type: RequestType;
  payload: Record<string, unknown>;
  strategy_id?: string | null;
}): Promise<ClientRequest> {
  const res = await api.post<ClientRequest>("/requests", args);
  return res.data;
}

// ── Backtests ───────────────────────────────────────────────────
export type BacktestEngine = "manual" | "vam";

export type BacktestListItem = {
  id: string;
  code: string;
  name: string;
  status: string;
  engine: BacktestEngine;
  completed_at: string | null;
  created_at: string;
};

export type BacktestDetail = {
  id: string;
  code: string;
  name: string;
  status: string;
  engine: BacktestEngine;
  assumptions: Record<string, unknown> | null;
  metrics: Record<string, unknown> | null;
  // For engine === "manual": v1.0 BacktestResult shape.
  // For engine === "vam":    VamPersistedBacktest envelope.
  // Use the discriminator on `engine` (not on result internals) before casting.
  result: BacktestResult | VamPersistedBacktest | null;
  completed_at: string | null;
  created_at: string;
};

/** The locked v1.0 backtest result schema (loaded server-side from the bucket). */
export type BacktestResult = {
  schema_version: string;
  result_type: "scanner" | "backtest" | "live";
  backtest_id: string;
  strategy: { name: string; version: string; description?: string; type: string };
  universe?: { name?: string; symbols?: string[]; market_data_provider?: { name: string }; brokerage?: { name: string } };
  assumptions: {
    date_range: { from: string; to: string };
    initial_capital: { amount: number; currency: string };
    timeframe: string;
    [k: string]: unknown;
  };
  metrics: {
    summary: Record<string, number>;
    risk?: Record<string, number>;
    [k: string]: unknown;
  };
  time_series: {
    equity_curve: { date: string; nav: number }[];
    drawdown_curve: { date: string; drawdown_pct: number }[];
    benchmark_curves?: { name: string; series: { date: string; value: number }[] }[];
  };
  trades: Array<{
    id: string;
    symbol: string;
    side: "long" | "short";
    entry: { timestamp: string; price: number; quantity: number };
    exit: { timestamp: string; price: number };
    pnl: { net: number; pct: number };
    holding?: { calendar_days?: number };
  }>;
  disclaimer?: string;
};

export async function fetchBacktests(status?: string): Promise<BacktestListItem[]> {
  const res = await api.get<BacktestListItem[]>("/backtests", { params: status ? { status } : {} });
  return res.data;
}

export async function fetchBacktest(id: string): Promise<BacktestDetail> {
  const res = await api.get<BacktestDetail>(`/backtests/${id}`);
  return res.data;
}

// ── Admin ───────────────────────────────────────────────────────
export type PlatformStats = {
  n_clients: number;
  n_clients_active: number;
  n_backtests: number;
  n_backtests_completed: number;
  n_requests_open: number;
  tier_distribution: Record<string, number>;
};

export async function fetchPlatformStats(): Promise<PlatformStats> {
  return (await api.get<PlatformStats>("/admin/stats")).data;
}

export type AdminClient = {
  id: string;
  name: string;
  primary_contact: string | null;
  tier: "tier1" | "tier2" | "tier3";
  status: "active" | "suspended";
  deleted_at: string | null;
  created_at: string;
};

export async function fetchAdminClients(): Promise<AdminClient[]> {
  return (await api.get<AdminClient[]>("/admin/clients")).data;
}

export async function createAdminClient(args: {
  name: string;
  primary_contact?: string;
  tier?: "tier1" | "tier2" | "tier3";
  user_email: string;
  user_password: string;
}) {
  return (await api.post("/admin/clients", args)).data;
}

export async function updateAdminClient(id: string, patch: Partial<AdminClient>) {
  return (await api.patch<AdminClient>(`/admin/clients/${id}`, patch)).data;
}

export async function deleteAdminClient(id: string) {
  await api.delete(`/admin/clients/${id}`);
}

export async function uploadBacktestResult(
  client_id: string,
  result: object,
  strategy_id?: string | null,
) {
  return (
    await api.post("/admin/backtests/upload-result", {
      client_id,
      result,
      ...(strategy_id ? { strategy_id } : {}),
    })
  ).data;
}

export async function fetchBacktestExampleTemplate(): Promise<object> {
  return (await api.get<object>("/admin/backtests/example-template")).data;
}

// ── Admin inbox: "what needs my attention right now" ───────────
export type AdminInboxItem = {
  type: "strategy_uploaded" | "request_open";
  id: string;
  client_id: string;
  client_name: string;
  title: string;
  subtitle: string;
  occurred_at: string;
  href: string;
};

export type AdminInbox = {
  items: AdminInboxItem[];
  total: number;
  unread_strategies: number;
  unread_requests: number;
};

export async function fetchAdminInbox(): Promise<AdminInbox> {
  return (await api.get<AdminInbox>("/admin/inbox")).data;
}

// Admin: list a specific client's requests (uses the same /admin/inbox under the hood
// would be nice but inbox only shows OPEN. We need full list per client.)
// We'll route via a new admin endpoint added below.
export async function fetchClientRequests(clientId: string): Promise<ClientRequest[]> {
  const r = await api.get<ClientRequest[]>(`/admin/clients/${clientId}/requests`);
  return r.data;
}

export async function publishTerms(args: {
  version: string;
  body: string;
  clauses: Array<{ id: string; title: string; body: string; required: boolean }>;
}) {
  return (await api.post("/admin/terms", args)).data;
}

export async function fetchAdminTerms() {
  return (await api.get("/admin/terms")).data;
}

export async function broadcastNotification(args: { title: string; body: string }) {
  return (await api.post("/admin/notifications/broadcast", args)).data;
}

export async function personalNotification(args: {
  client_id: string;
  title: string;
  body: string;
}) {
  return (await api.post("/admin/notifications/personal", args)).data;
}

export type AuditEntry = {
  id: string;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  payload: Record<string, unknown> | null;
  ip: string | null;
  occurred_at: string;
};

export async function fetchAuditLog(action_prefix?: string): Promise<AuditEntry[]> {
  return (await api.get<AuditEntry[]>("/admin/audit", {
    params: action_prefix ? { action_prefix } : {},
  })).data;
}

// ── Admin: client-strategies (read uploads to know what the client wants tested) ──
export type AdminStrategy = {
  id: string;
  client_id: string;
  name: string;
  version: number;
  storage_key: string;
  size_bytes: number | null;
  mime_type: string | null;
  checksum: string | null;
  is_source_of_truth: boolean;
  status: string;
  uploaded_by: string | null;
  uploaded_at: string;
};

export async function fetchClientStrategies(clientId: string): Promise<AdminStrategy[]> {
  const r = await api.get<AdminStrategy[]>(`/admin/clients/${clientId}/strategies`);
  return r.data;
}

export async function getStrategyDownloadUrl(strategyId: string): Promise<string> {
  const r = await api.get<{ signed_url: string; expires_in: number }>(
    `/admin/strategies/${strategyId}/download-url`
  );
  return r.data.signed_url;
}

// ───────────────────────────────────────────────────────────────────────────
// VAM (Volatility-Adjusted Momentum) engine — proxied through our backend.
// Both admin and client routes return the same response shapes; the only
// difference is which endpoint family they hit and what they're allowed to do.
// ───────────────────────────────────────────────────────────────────────────

export type VamStepId = "step1" | "step2" | "step3" | "step4_svix" | "step4_combined";

export type VamStrategy = {
  id: VamStepId | string;
  name: string;
  implemented: boolean;
  // VAM may include additional fields (assets, description) we just preserve as-is
  [extra: string]: unknown;
};

export type VamParamSchemaField = {
  name: string;
  type: "int" | "float" | "bool" | "enum" | "date" | string;
  default: unknown;
  min?: number;
  max?: number;
  options?: string[];        // populated for type === "enum"
  description?: string;
};

export type VamStepSchema = {
  step_id?: string;
  parameters: VamParamSchemaField[];
  [extra: string]: unknown;
};

export type VamSymbol = {
  symbol: string;
  start: string;             // YYYY-MM-DD
  end: string;               // YYYY-MM-DD
  [extra: string]: unknown;
};

export type VamTimeValuePoint = { time: string; value: number };

export type VamMarker = {
  time: string;
  position?: string;
  color?: string;
  shape?: string;
  text?: string;
};

export type VamChartData = {
  equity?: VamTimeValuePoint[];
  spy?: VamTimeValuePoint[];
  sma50?: VamTimeValuePoint[];
  sma200?: VamTimeValuePoint[];
  vix?: VamTimeValuePoint[];
  svix?: VamTimeValuePoint[];
  markers?: VamMarker[];
};

export type VamTradeAction = {
  execution_date: string;
  action: string;            // contains BUY / SELL — VAM may compose ("BUY UPRO")
  instrument: string;
  state_from?: string | null;
  state_to?: string | null;
  exec_price?: number | null;
  trade_value_dollars?: number | null;
  portfolio_value_at_close?: number | null;
  trigger_reason?: string | null;
  [extra: string]: unknown;
};

export type VamMetrics = {
  final_value?: number;
  total_return_pct?: number;
  cagr_pct?: number;
  sharpe?: number;
  sharpe_ratio?: number;
  sortino?: number;
  sortino_ratio?: number;
  calmar?: number;
  calmar_ratio?: number;
  max_drawdown_pct?: number;
  max_drawdown_date?: string;
  total_trades?: number;
  years?: number;
  start_date?: string;
  end_date?: string;
  alpha_vs_spy_pct?: number;
  [extra: string]: unknown;
};

export type VamRunResponse = {
  backtest_id: string;       // our internal code, BT-...
  code: string;
  name: string;
  storage_key: string;
};

// Full envelope we persist + fetch back on the detail page (mirrors backtest.vam.schema.json)
export type VamPersistedBacktest = {
  schema_version: "vam-1.0";
  result_type: "vam_backtest";
  backtest_id: string;
  source: "vam";
  step: VamStepId | string;
  params: Record<string, unknown>;
  created_at: string;
  client: { client_id: string; client_name: string };
  triggered_by?: { actor_type: "admin" | "client"; actor_id: string; actor_email?: string };
  engine_response: {
    cached?: boolean;
    metrics: VamMetrics;
    trades: VamTradeAction[];
    chart_data: VamChartData;
    [extra: string]: unknown;
  };
};

// ── Listing + schema (proxied, available to both admins and clients) ────────

/** Use the client-facing path; admins are also signed-in users so this works for them too. */
export async function fetchVamStrategies(): Promise<VamStrategy[]> {
  const r = await api.get<VamStrategy[]>(`/vam/strategies`);
  return r.data;
}

export async function fetchVamSchema(stepId: string): Promise<VamStepSchema> {
  const r = await api.get<VamStepSchema>(`/vam/strategies/${stepId}/schema`);
  return r.data;
}

export async function fetchVamSymbols(): Promise<VamSymbol[]> {
  const r = await api.get<VamSymbol[]>(`/vam/symbols`);
  return r.data;
}

// ── Admin-scoped VAM fetchers ───────────────────────────────────────────────
// Admins need their own set because the client-scoped routes above are gated
// by `vam_client_scope`, which 403s any non-client (including admins). These
// hit the `/admin/vam/*` proxy which is gated by `require_role`.

export async function fetchVamStrategiesAsAdmin(): Promise<VamStrategy[]> {
  const r = await api.get<VamStrategy[]>(`/admin/vam/strategies`);
  return r.data;
}

export async function fetchVamSchemaAsAdmin(stepId: string): Promise<VamStepSchema> {
  const r = await api.get<VamStepSchema>(`/admin/vam/strategies/${stepId}/schema`);
  return r.data;
}

export async function fetchVamSymbolsAsAdmin(): Promise<VamSymbol[]> {
  const r = await api.get<VamSymbol[]>(`/admin/vam/symbols`);
  return r.data;
}

export async function fetchVamDataInfo(): Promise<unknown> {
  const r = await api.get(`/admin/vam/data-info`);
  return r.data;
}

export async function fetchVamProfile(): Promise<unknown> {
  const r = await api.get(`/admin/vam/profile`);
  return r.data;
}

// ── Run a backtest ──────────────────────────────────────────────────────────

/** Client self-serve: server pins client_id from session. */
export async function runVamAsClient(args: {
  step: VamStepId | string;
  params: Record<string, unknown>;
  strategy_id?: string | null;
}): Promise<VamRunResponse> {
  const r = await api.post<VamRunResponse>(`/vam/run`, args);
  return r.data;
}

/** Admin runs for a specified client (body includes client_id). */
export async function runVamAsAdmin(args: {
  client_id: string;
  step: VamStepId | string;
  params: Record<string, unknown>;
  strategy_id?: string | null;
}): Promise<VamRunResponse> {
  const r = await api.post<VamRunResponse>(`/admin/vam/run`, args);
  return r.data;
}
