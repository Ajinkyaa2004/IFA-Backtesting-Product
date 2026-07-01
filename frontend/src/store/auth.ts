import { create } from "zustand";
import { installAuthFailureHandler, type AuthGateReason, type Me } from "../lib/api";
import { setSentryUser } from "../lib/sentry";

type AuthState = {
  me: Me | null;
  loading: boolean;
  /**
   * Why /me failed (if it did). Drives the App.tsx routing decision so we can
   * render a meaningful screen instead of bouncing the user to /login on every
   * kind of error. See sweep findings #2, #3.
   *   "unauthenticated"      — token expired/revoked → user goes to /login
   *   "not_provisioned"      — Firebase user exists, no DB row → show "contact admin"
   *   "suspended"            — User.status='suspended' → show "account suspended"
   *   "backend_unavailable"  — 5xx / network → show retry button
   *   null                   — no error (either authed or not yet attempted)
   */
  authError: AuthGateReason | null;
  setMe: (me: Me | null) => void;
  setLoading: (l: boolean) => void;
  setAuthError: (r: AuthGateReason | null) => void;
};

export const useAuth = create<AuthState>((set) => ({
  me: null,
  loading: true,
  authError: null,
  setMe: (me) => {
    // Tag every Sentry error with the current user id + role. No email, no
    // client name — see setSentryUser() rationale in lib/sentry.ts.
    setSentryUser(me ? { id: me.id, role: me.role } : null);
    set({ me, authError: null });  // landing me clears any pending error
  },
  setLoading: (loading) => set({ loading }),
  setAuthError: (authError) => set({ authError }),
}));

// Wire api.ts → store: when a 401 fires, clear me + flag the reason. This
// avoids a circular import (api.ts imports the store would create a cycle
// because the store imports types from api.ts). The store calls back into
// api.ts to install itself.
installAuthFailureHandler(() => {
  setSentryUser(null);
  useAuth.setState({ me: null, authError: "unauthenticated", loading: false });
});
