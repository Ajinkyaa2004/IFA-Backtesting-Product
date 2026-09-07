/**
 * Shown to a user whose signup_status = 'pending_approval'.
 * They can't reach the dashboard, strategies, requests, etc. until an
 * admin approves them — they'll receive an email when that happens.
 *
 * There's a "Check status" button so they don't have to sign out + back
 * in to notice the moment they get approved. That refetches /me — the
 * moment the backend flips signup_status to 'approved', App.tsx's routing
 * will bounce them to /terms (or /dashboard).
 */

import { signOut } from "firebase/auth";
import { Clock, LogOut, Mail, RefreshCw } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchMe } from "../../lib/api";
import { auth } from "../../lib/firebase";
import { useAuth } from "../../store/auth";

export default function PendingApprovalPage() {
  const me = useAuth((s) => s.me);
  const setMe = useAuth((s) => s.setMe);
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [checkedRecently, setCheckedRecently] = useState(false);

  const meta = me?.signup_metadata ?? {};
  const displayName = meta.name || me?.email?.split("@")[0] || "there";

  const onCheckStatus = async () => {
    setChecking(true);
    try {
      const fresh = await fetchMe();
      setMe(fresh);
      if (fresh.signup_status === "approved") {
        if (fresh.needs_tnc_acceptance) navigate("/terms", { replace: true });
        else navigate("/dashboard", { replace: true });
        return;
      }
      if (fresh.signup_status === "rejected") {
        navigate("/rejected", { replace: true });
        return;
      }
      setCheckedRecently(true);
      setTimeout(() => setCheckedRecently(false), 3000);
    } catch {
      /* swallow — the retry button is right there */
    } finally {
      setChecking(false);
    }
  };

  const onSignOut = async () => {
    try {
      await signOut(auth);
    } catch {
      /* ignore */
    }
    setMe(null);
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-white via-white to-amber-50/40 dark:from-ink-950 dark:via-ink-950 dark:to-amber-950/10">
      <div className="w-full max-w-md">
        <div className="bg-white dark:bg-ink-900 rounded-2xl shadow-pop border border-ink-200 dark:border-ink-800 p-8 text-center">
          <div className="mx-auto size-14 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-4">
            <Clock size={24} />
          </div>

          <h1 className="text-xl font-semibold tracking-tight mb-2">
            You're on the list, {displayName}.
          </h1>
          <p className="text-sm text-ink-500 dark:text-ink-400 mb-5">
            Thanks for signing up. An IFA admin will review your request
            {meta.company ? (
              <>
                {" "}for <span className="font-medium text-ink-700 dark:text-ink-200">{meta.company}</span>
              </>
            ) : null}
            {" "}and get back to you within one business day.
          </p>

          <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg p-4 text-left space-y-2 mb-6">
            <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
              <Mail size={14} className="mt-0.5 shrink-0" />
              <div>
                We'll send an approval email to{" "}
                <span className="font-medium">{me?.email ?? "your inbox"}</span>{" "}
                the moment access is unlocked.
              </div>
            </div>
          </div>

          <button
            onClick={onCheckStatus}
            disabled={checking}
            className="w-full h-10 bg-accent-600 hover:bg-accent-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2 mb-3"
          >
            <RefreshCw size={14} className={checking ? "animate-spin" : ""} />
            {checking ? "Checking…" : checkedRecently ? "Still pending — hang tight" : "Check my status"}
          </button>

          <button
            onClick={onSignOut}
            className="w-full h-9 text-xs text-ink-500 hover:text-ink-900 dark:hover:text-ink-100 inline-flex items-center justify-center gap-1.5 transition-colors"
          >
            <LogOut size={12} /> Sign out
          </button>
        </div>

        <p className="mt-4 text-center text-[11px] text-ink-400">
          Signed in as {me?.email ?? "—"}
        </p>
      </div>
    </div>
  );
}
