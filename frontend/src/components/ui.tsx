import { type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { backdropFade, modalScale } from "../lib/motion";

export function Card({
  className = "",
  children,
  padding = "p-5",
}: {
  className?: string;
  children: ReactNode;
  padding?: string;
}) {
  return (
    <div
      className={`bg-white dark:bg-ink-900 border border-ink-200/70 dark:border-ink-800 rounded-2xl shadow-card ${padding} ${className}`}
    >
      {children}
    </div>
  );
}

export function SectionTitle({
  children,
  sub,
  action,
}: {
  children: ReactNode;
  sub?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between mb-4 gap-4">
      <div className="min-w-0">
        <h2 className="text-base font-semibold tracking-tight text-ink-900 dark:text-ink-50">
          {children}
        </h2>
        {sub && <p className="text-xs text-ink-500 dark:text-ink-400 mt-0.5">{sub}</p>}
      </div>
      {action}
    </div>
  );
}

export type ButtonVariant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type ButtonProps = {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  icon?: ReactNode;
  children?: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  className?: string;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  icon,
  children,
  onClick,
  className = "",
  type = "button",
  disabled,
}: ButtonProps) {
  const sizes = {
    sm: "h-8 px-2.5 text-xs",
    md: "h-9 px-3.5 text-sm",
    lg: "h-10 px-4 text-sm",
  };
  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-ink-900 text-white hover:bg-ink-700 dark:bg-ink-50 dark:text-ink-900 dark:hover:bg-white",
    accent: "bg-accent-600 text-white hover:bg-accent-700 shadow-sm",
    secondary:
      "bg-white text-ink-900 border border-ink-200 hover:bg-ink-50 dark:bg-ink-900 dark:text-ink-50 dark:border-ink-700 dark:hover:bg-ink-800",
    ghost:
      "text-ink-700 hover:bg-ink-100 dark:text-ink-200 dark:hover:bg-ink-800",
    danger: "bg-red-600 text-white hover:bg-red-700",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-2 font-medium rounded-lg transition-all active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {icon}
      {children}
    </button>
  );
}

const STATUS_STYLES: Record<string, string> = {
  Active: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300",
  active: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300",
  Completed: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300",
  Quoted: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300",
  Resolved: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300",
  resolved: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-600/15 dark:bg-emerald-500/10 dark:text-emerald-300",
  in_progress: "bg-sky-50 text-sky-700 ring-sky-600/15 dark:bg-sky-500/10 dark:text-sky-300",
  "In Progress": "bg-sky-50 text-sky-700 ring-sky-600/15 dark:bg-sky-500/10 dark:text-sky-300",
  open: "bg-sky-50 text-sky-700 ring-sky-600/15 dark:bg-sky-500/10 dark:text-sky-300",
  Open: "bg-sky-50 text-sky-700 ring-sky-600/15 dark:bg-sky-500/10 dark:text-sky-300",
  pending: "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-300",
  Pending: "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-300",
  draft: "bg-ink-100 text-ink-600 ring-ink-300/40 dark:bg-ink-800 dark:text-ink-300",
  quote_sent: "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-300",
  quote_requested: "bg-amber-50 text-amber-700 ring-amber-600/15 dark:bg-amber-500/10 dark:text-amber-300",
  cancelled: "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-500/10 dark:text-red-300",
  revision_requested: "bg-red-50 text-red-700 ring-red-600/15 dark:bg-red-500/10 dark:text-red-300",
  Archived: "bg-ink-100 text-ink-600 ring-ink-300/40 dark:bg-ink-800 dark:text-ink-300",
  Default: "bg-ink-100 text-ink-600 ring-ink-300/40 dark:bg-ink-800 dark:text-ink-300",
};

export function Badge({
  children,
  status,
  className = "",
  dot = false,
}: {
  children: ReactNode;
  status?: string;
  className?: string;
  dot?: boolean;
}) {
  const tone = (status && STATUS_STYLES[status]) || STATUS_STYLES.Default;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium ring-1 ring-inset ${tone} ${className}`}
    >
      {dot && <span className="size-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

export function StatTile({
  label,
  value,
  delta,
  icon,
  tone = "neutral",
}: {
  label: string;
  value: ReactNode;
  delta?: ReactNode;
  icon?: ReactNode;
  tone?: "pos" | "neg" | "neutral";
}) {
  const toneClasses = {
    pos: "text-emerald-600 dark:text-emerald-400",
    neg: "text-red-600 dark:text-red-400",
    neutral: "text-ink-500 dark:text-ink-400",
  };
  return (
    <Card padding="p-5">
      <div className="flex items-start justify-between">
        <div className="text-xs font-medium uppercase tracking-wider text-ink-500 dark:text-ink-400">
          {label}
        </div>
        {icon && (
          <span className="size-7 rounded-lg bg-ink-100 dark:bg-ink-800 flex items-center justify-center text-ink-600 dark:text-ink-300">
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 text-2xl font-semibold tabular text-ink-900 dark:text-ink-50">
        {value}
      </div>
      {delta && <div className={`mt-1 text-xs tabular ${toneClasses[tone]}`}>{delta}</div>}
    </Card>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const w = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-3xl" }[size];
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 bg-ink-900/40 dark:bg-ink-950/70 backdrop-blur-sm overflow-y-auto"
          variants={backdropFade}
          initial="hidden"
          animate="visible"
          exit="exit"
          onClick={onClose}
        >
          <motion.div
            className={`w-full ${w} max-h-[calc(100vh-1.5rem)] sm:max-h-[calc(100vh-3rem)] flex flex-col bg-white dark:bg-ink-900 rounded-2xl shadow-pop border border-ink-200 dark:border-ink-800 overflow-hidden`}
            variants={modalScale}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-ink-100 dark:border-ink-800 shrink-0">
              <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
              <button
                onClick={onClose}
                className="size-7 -mr-1 rounded-md text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800 flex items-center justify-center"
                aria-label="Close"
              >
                <X size={14}/>
              </button>
            </div>
            <div className="px-4 sm:px-6 py-4 sm:py-5 overflow-y-auto flex-1 min-h-0">{children}</div>
            {footer && (
              <div className="px-4 sm:px-6 py-3 sm:py-4 bg-ink-50 dark:bg-ink-950/40 border-t border-ink-100 dark:border-ink-800 shrink-0">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function KV({ k, v, mono = false }: { k: ReactNode; v: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-ink-100 dark:border-ink-800 last:border-0">
      <span className="text-xs text-ink-500 dark:text-ink-400">{k}</span>
      <span className={`text-sm text-ink-900 dark:text-ink-100 ${mono ? "font-mono" : ""}`}>{v}</span>
    </div>
  );
}
