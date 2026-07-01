/**
 * Content store. Populated on app boot from GET /content; if the request
 * fails (network hiccup, first-launch), we ship the hardcoded defaults so
 * the client dashboard always renders something.
 *
 * Preview mode (?admin-preview=1 in the URL): the store listens for
 * postMessage from window.parent and updates its content on every message.
 * The admin editor iframe uses this to render live previews of unsaved
 * changes without a round-trip.
 */
import { create } from "zustand";
import { CONTENT_DEFAULTS, type ContentDoc } from "../lib/contentDefaults";
import { api } from "../lib/api";

interface ContentStore {
  content: ContentDoc;
  loaded: boolean;
  previewMode: boolean;
  hydrate: () => Promise<void>;
  applyPreview: (patch: Partial<ContentDoc>) => void;
}

function isPreviewMode(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("admin-preview") === "1";
}

export const useContent = create<ContentStore>((set) => ({
  content: CONTENT_DEFAULTS,
  loaded: false,
  previewMode: isPreviewMode(),
  hydrate: async () => {
    // Skip network hydration in preview mode — content comes via postMessage.
    if (isPreviewMode()) {
      set({ loaded: true });
      return;
    }
    try {
      const r = await api.get<Partial<ContentDoc>>("/content");
      set({ content: mergeWithDefaults(r.data), loaded: true });
    } catch {
      // API failed — keep defaults, still mark loaded so components render.
      set({ loaded: true });
    }
  },
  applyPreview: (patch) => {
    set((s) => ({ content: mergeWithDefaults(patch, s.content) }));
  },
}));

// Deep-merge partial content over a base. Lists are replaced (matching
// the backend's _deep_merge behaviour). Both args should have the same
// shape as ContentDoc; missing keys fall through to base.
function mergeWithDefaults(partial: unknown, base: ContentDoc = CONTENT_DEFAULTS): ContentDoc {
  if (!partial || typeof partial !== "object") return base;
  const out: any = { ...base };
  for (const key of Object.keys(partial) as (keyof ContentDoc)[]) {
    const v = (partial as any)[key];
    if (v && typeof v === "object" && !Array.isArray(v)) {
      out[key] = { ...(base as any)[key], ...deepMergePlain((base as any)[key], v) };
    } else if (v !== undefined) {
      out[key] = v;
    }
  }
  return out as ContentDoc;
}

function deepMergePlain(base: any, override: any): any {
  if (!base || typeof base !== "object") return override;
  if (!override || typeof override !== "object") return override;
  const out: any = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(override)) {
    const v = override[k];
    if (v && typeof v === "object" && !Array.isArray(v) && typeof base[k] === "object") {
      out[k] = deepMergePlain(base[k], v);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// Auto-wire preview postMessage listener at module load. The admin editor
// posts `{ type: 'ifa-content-preview', content: <partial> }` and the
// iframe applies it live.
if (typeof window !== "undefined" && isPreviewMode()) {
  window.addEventListener("message", (e: MessageEvent) => {
    if (e.data && e.data.type === "ifa-content-preview" && e.data.content) {
      useContent.getState().applyPreview(e.data.content);
    }
  });
  // Ping the parent so the admin can send an initial snapshot without
  // waiting for the first edit.
  window.parent?.postMessage({ type: "ifa-content-preview-ready" }, "*");
}
