import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { slideInRight } from "../lib/motion";
import { type Toast, useToastStore } from "../store/toast";

/**
 * Renders the current toast queue in the bottom-right corner.
 * Mount ONCE at the app root (main.tsx) so it's always visible above
 * any modal / drawer / dropdown.
 *
 * Each toast schedules its own auto-dismiss timer via a per-toast effect
 * so clearing one doesn't cancel the others.
 */
export default function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="fixed bottom-4 right-4 z-[100] flex flex-col-reverse gap-2 max-w-sm w-[calc(100vw-2rem)]"
    >
      <AnimatePresence>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({ toast }: { toast: Toast }) {
  const dismiss = useToastStore((s) => s.dismiss);

  useEffect(() => {
    if (toast.durationMs == null) return;
    const t = window.setTimeout(() => dismiss(toast.id), toast.durationMs);
    return () => window.clearTimeout(t);
  }, [toast.id, toast.durationMs, dismiss]);

  const meta = STYLES[toast.kind];

  return (
    <motion.div
      role="status"
      layout
      variants={slideInRight}
      initial="hidden"
      animate="visible"
      exit="exit"
      className={`shadow-pop rounded-xl border ${meta.border} ${meta.bg} px-3.5 py-3 flex items-start gap-2.5`}
    >
      <span className={`mt-0.5 shrink-0 ${meta.icon}`}>{meta.iconNode}</span>
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold ${meta.title}`}>{toast.title}</div>
        {toast.body && (
          <div className={`text-xs mt-0.5 ${meta.body}`}>{toast.body}</div>
        )}
      </div>
      <button
        onClick={() => dismiss(toast.id)}
        className={`shrink-0 size-6 rounded-md hover:bg-white/50 dark:hover:bg-black/20 flex items-center justify-center ${meta.close}`}
        aria-label="Dismiss"
      >
        <X size={13} />
      </button>
    </motion.div>
  );
}

const STYLES: Record<Toast["kind"], {
  border: string;
  bg: string;
  icon: string;
  title: string;
  body: string;
  close: string;
  iconNode: React.ReactNode;
}> = {
  success: {
    border: "border-emerald-200 dark:border-emerald-500/30",
    bg: "bg-emerald-50 dark:bg-emerald-500/10",
    icon: "text-emerald-600 dark:text-emerald-400",
    title: "text-emerald-900 dark:text-emerald-100",
    body: "text-emerald-800 dark:text-emerald-200/80",
    close: "text-emerald-700 dark:text-emerald-300",
    iconNode: <CheckCircle2 size={16} />,
  },
  error: {
    border: "border-red-200 dark:border-red-500/30",
    bg: "bg-red-50 dark:bg-red-500/10",
    icon: "text-red-600 dark:text-red-400",
    title: "text-red-900 dark:text-red-100",
    body: "text-red-800 dark:text-red-200/80",
    close: "text-red-700 dark:text-red-300",
    iconNode: <XCircle size={16} />,
  },
  warning: {
    border: "border-amber-200 dark:border-amber-500/30",
    bg: "bg-amber-50 dark:bg-amber-500/10",
    icon: "text-amber-600 dark:text-amber-400",
    title: "text-amber-900 dark:text-amber-100",
    body: "text-amber-800 dark:text-amber-200/80",
    close: "text-amber-700 dark:text-amber-300",
    iconNode: <AlertTriangle size={16} />,
  },
  info: {
    border: "border-ink-200 dark:border-ink-700",
    bg: "bg-white dark:bg-ink-900",
    icon: "text-accent-600 dark:text-accent-400",
    title: "text-ink-900 dark:text-ink-50",
    body: "text-ink-600 dark:text-ink-300",
    close: "text-ink-500 dark:text-ink-400",
    iconNode: <Info size={16} />,
  },
};
