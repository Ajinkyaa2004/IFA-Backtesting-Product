import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, BadgeCheck, Check, ChevronDown, Cpu, FileText, X } from "lucide-react";
import { Card } from "../../components/ui";
import { reAckScope, type EngagementSummary } from "../../lib/api";
import { modalScale } from "../../lib/motion";
import { toast } from "../../store/toast";

/**
 * The Engagement scope panel — Chirag Section 9. Pinned at the top of the
 * client Overview so the client always sees exactly what they're buying
 * (scope in) and what they aren't (scope out), plus the engine status and
 * their current engagement code. Read-only for the client.
 *
 * Also handles the re-ack banner: when the admin bumps scope_version, the
 * client sees a red banner on next login until they click "I acknowledge".
 *
 * ENGINE_LABEL is intentionally short. The stepper (Chirag Item #2) will
 * expand engine status into a full milestone.
 */

const ENGINE_LABEL: Record<EngagementSummary["engine_assignment"], string> = {
  existing: "Existing engine assigned",
  bespoke: "Bespoke engine being built",
  manual: "Manual delivery",
};

const ENGINE_ICON_COLOR: Record<EngagementSummary["engine_assignment"], string> = {
  existing: "text-emerald-600 dark:text-emerald-400",
  bespoke:  "text-amber-600 dark:text-amber-400",
  manual:   "text-ink-500 dark:text-ink-400",
};

export default function ScopePanel({
  engagement,
  onScopeReacked,
}: {
  engagement: EngagementSummary;
  onScopeReacked?: () => void;
}) {
  const [reackOpen, setReackOpen] = useState<boolean>(engagement.needs_scope_reack);
  const [collapsed, setCollapsed] = useState(false);

  const acknowledge = async () => {
    try {
      await reAckScope();
      toast.success("Acknowledged", "You've accepted the current engagement scope.");
      setReackOpen(false);
      onScopeReacked?.();
    } catch (e: any) {
      toast.error("Could not acknowledge", e?.response?.data?.detail ?? "Try again.");
    }
  };

  return (
    <>
      {/* Re-ack modal — blocks the dashboard until acknowledged. Only fires
          once per scope_version bump per user. */}
      <AnimatePresence>
        {reackOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-ink-900/50 dark:bg-ink-950/80 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="w-full max-w-md bg-white dark:bg-ink-900 rounded-2xl shadow-pop border border-ink-200 dark:border-ink-800 overflow-hidden"
              variants={modalScale}
              initial="hidden"
              animate="visible"
              exit="exit"
            >
              <div className="px-6 pt-5 pb-3 flex items-center gap-3 border-b border-ink-100 dark:border-ink-800">
                <span className="size-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                  <AlertCircle size={18} />
                </span>
                <div>
                  <div className="text-sm font-semibold">Engagement scope updated</div>
                  <div className="text-[11px] text-ink-500">Version {engagement.scope_version}</div>
                </div>
              </div>
              <div className="px-6 py-5 space-y-3 text-sm">
                <p className="text-ink-700 dark:text-ink-200">
                  Your account manager has updated the scope of this engagement. Please review the
                  current scope in/out below and acknowledge to continue.
                </p>
                <ScopeList title="In scope" items={engagement.scope_in} tone="in" />
                <ScopeList title="Out of scope" items={engagement.scope_out} tone="out" />
              </div>
              <div className="px-6 py-4 bg-ink-50 dark:bg-ink-950/40 border-t border-ink-100 dark:border-ink-800 flex justify-end">
                <button
                  onClick={acknowledge}
                  className="h-9 px-4 rounded-lg bg-accent-600 hover:bg-accent-700 text-white text-sm font-medium"
                >
                  I acknowledge
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pinned scope panel */}
      <Card padding="p-0">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="w-full px-5 py-3 flex items-center justify-between hover:bg-ink-50/50 dark:hover:bg-ink-800/30 transition-colors"
        >
          <div className="flex items-center gap-3 min-w-0">
            <span className="size-8 rounded-lg bg-accent-600/10 text-accent-700 dark:text-accent-300 flex items-center justify-center shrink-0">
              <BadgeCheck size={16} />
            </span>
            <div className="min-w-0 text-left">
              <div className="text-sm font-semibold text-ink-900 dark:text-ink-50 truncate">
                Engagement · <span className="font-mono">{engagement.code}</span>
              </div>
              <div className="text-[11px] text-ink-500 dark:text-ink-400 truncate">
                {engagement.deliverable || "No deliverable set"} · scope v{engagement.scope_version}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="hidden sm:inline text-[11px] text-ink-500 inline-flex items-center gap-1.5">
              <Cpu size={12} className={ENGINE_ICON_COLOR[engagement.engine_assignment]} />
              {ENGINE_LABEL[engagement.engine_assignment]}
            </span>
            <motion.span animate={{ rotate: collapsed ? -90 : 0 }}>
              <ChevronDown size={16} className="text-ink-400" />
            </motion.span>
          </div>
        </button>

        <AnimatePresence initial={false}>
          {!collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.24, ease: [0.32, 0.72, 0, 1] }}
              className="overflow-hidden"
            >
              <div className="px-5 pb-4 pt-1 grid grid-cols-1 sm:grid-cols-2 gap-4 border-t border-ink-100 dark:border-ink-800">
                <ScopeList title="In scope" items={engagement.scope_in} tone="in" />
                <ScopeList title="Out of scope" items={engagement.scope_out} tone="out" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </>
  );
}

function ScopeList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "in" | "out";
}) {
  const iconColor =
    tone === "in"
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-ink-400 dark:text-ink-500";
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-ink-500 dark:text-ink-400 mb-1.5 inline-flex items-center gap-1.5">
        <FileText size={10} /> {title}
      </div>
      {items.length === 0 ? (
        <div className="text-xs text-ink-400 dark:text-ink-500 italic">Not specified.</div>
      ) : (
        <ul className="space-y-1">
          {items.map((s, i) => (
            <li key={`${title}-${i}`} className="flex items-start gap-2 text-xs text-ink-700 dark:text-ink-200">
              {tone === "in" ? (
                <Check size={12} className={`mt-0.5 shrink-0 ${iconColor}`} />
              ) : (
                <X size={12} className={`mt-0.5 shrink-0 ${iconColor}`} />
              )}
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
