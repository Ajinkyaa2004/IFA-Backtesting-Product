import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { UserRound, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { slideDown } from "../lib/motion";
import { exitImpersonation } from "../lib/api";
import { useImpersonate } from "../store/impersonate";

/**
 * Sticky red banner shown across the entire app whenever an admin has an
 * active impersonation session. Two purposes:
 *   1. Impossible to miss you're not seeing your own data.
 *   2. One-click exit back to /admin.
 */
export default function ImpersonationBanner() {
  const active = useImpersonate((s) => s.active);
  const stop = useImpersonate((s) => s.stop);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const exit = async () => {
    if (!active) return;
    setBusy(true);
    try {
      await exitImpersonation(active.clientId);
    } catch {
      /* audit-log failed, but drop client-side state anyway */
    }
    stop();
    setBusy(false);
    nav("/admin/clients");
  };

  return (
    <AnimatePresence>
      {active && (
    <motion.div
      variants={slideDown}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="sticky top-0 z-40 bg-red-600 text-white shadow-md"
    >
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3 text-sm">
        <div className="flex items-center gap-2 min-w-0">
          <UserRound size={16} className="shrink-0" />
          <span className="font-medium">Impersonating:</span>
          <span className="truncate">{active.clientName}</span>
          <span className="hidden sm:inline text-red-100 text-xs">
            · read-only · every write is blocked · session audit-logged
          </span>
        </div>
        <button
          onClick={exit}
          disabled={busy}
          className="shrink-0 inline-flex items-center gap-1.5 h-7 px-3 rounded-md bg-red-700 hover:bg-red-800 disabled:opacity-60 text-xs font-semibold"
        >
          <X size={13} />
          {busy ? "Exiting…" : "Exit impersonation"}
        </button>
      </div>
    </motion.div>
      )}
    </AnimatePresence>
  );
}
