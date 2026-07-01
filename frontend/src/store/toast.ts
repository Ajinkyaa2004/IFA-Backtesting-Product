/**
 * Global toast queue. Every surface that used to alert() or drop an inline
 * error string can now call toast.error(...) / toast.success(...) and get
 * a consistent bottom-right notification with auto-dismiss.
 *
 * Zustand-backed so any component can push without prop-drilling; the
 * Toaster component subscribes to the list and renders it.
 */
import { create } from "zustand";

export type ToastKind = "success" | "error" | "info" | "warning";

export type Toast = {
  id: string;
  kind: ToastKind;
  title: string;
  body?: string;
  createdAt: number;
  /** Milliseconds to auto-dismiss. Null = sticky until manually closed. */
  durationMs: number | null;
};

interface ToastStore {
  toasts: Toast[];
  push: (t: Omit<Toast, "id" | "createdAt">) => string;
  dismiss: (id: string) => void;
  clear: () => void;
}

let idSeq = 0;
function nextId(): string {
  idSeq += 1;
  return `t-${Date.now()}-${idSeq}`;
}

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (t) => {
    const id = nextId();
    const full: Toast = {
      id,
      createdAt: Date.now(),
      ...t,
    };
    set((s) => ({ toasts: [...s.toasts, full] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
  clear: () => set({ toasts: [] }),
}));

// Convenience wrappers so call sites read cleanly:
//   toast.success("Saved")
//   toast.error("Upload failed", "The engine returned 502.")
export const toast = {
  success: (title: string, body?: string, durationMs: number | null = 3500) =>
    useToastStore.getState().push({ kind: "success", title, body, durationMs }),
  error: (title: string, body?: string, durationMs: number | null = 6000) =>
    useToastStore.getState().push({ kind: "error", title, body, durationMs }),
  info: (title: string, body?: string, durationMs: number | null = 4000) =>
    useToastStore.getState().push({ kind: "info", title, body, durationMs }),
  warning: (title: string, body?: string, durationMs: number | null = 5000) =>
    useToastStore.getState().push({ kind: "warning", title, body, durationMs }),
  dismiss: (id: string) => useToastStore.getState().dismiss(id),
};
