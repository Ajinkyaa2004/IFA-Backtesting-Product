/**
 * Impersonation state — Phase 4.5 Day 4 admin support tool.
 *
 * When a main_admin or sub_admin needs to reproduce something a client is
 * seeing (bug report, T&C confusion, "where did my backtest go") they can
 * flip on impersonation from the admin clients drawer. From that point on,
 * every axios request adds an X-Impersonate-Client-Id header, which the
 * backend's client_scope dep honors — the admin reads exactly the same
 * data the client would.
 *
 * Enforced READ-ONLY at the backend layer: any non-GET request while
 * impersonating returns 403. The admin has to exit impersonation to make
 * changes on the client's behalf, which is intentional — it forces every
 * mutation to be attributable to the admin, not "the client did it".
 *
 * Persistence: localStorage-backed so a page reload doesn't drop the
 * session. Cleared on exit or admin logout.
 */
import { create } from "zustand";

const STORAGE_KEY = "ifa.impersonate";

export type ImpersonationState = {
  clientId: string;
  clientName: string;
  tier: string;
  startedAt: string; // ISO string
};

interface ImpersonateStore {
  active: ImpersonationState | null;
  start: (s: ImpersonationState) => void;
  stop: () => void;
}

function loadInitial(): ImpersonationState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ImpersonationState;
    if (!parsed?.clientId || !parsed?.clientName) return null;
    return parsed;
  } catch {
    return null;
  }
}

export const useImpersonate = create<ImpersonateStore>((set) => ({
  active: loadInitial(),
  start: (s) => {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* quota */ }
    set({ active: s });
  },
  stop: () => {
    try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    set({ active: null });
  },
}));

/** Non-hook synchronous read for the axios interceptor. */
export function currentImpersonatedClientId(): string | null {
  return useImpersonate.getState().active?.clientId ?? null;
}
