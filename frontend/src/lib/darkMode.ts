/**
 * Dark-mode persistence. Both Layout + AdminLayout should share the same
 * source of truth so a client-page toggle carries over when the client
 * clicks their way into /admin (impersonating). Also survives reloads.
 *
 * Falls back to the OS preference when nothing has been chosen yet.
 */

const KEY = "ifa.dark";

export function initialDarkMode(): boolean {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(KEY);
  if (stored === "1") return true;
  if (stored === "0") return false;
  // OS preference (first visit)
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function setDarkMode(on: boolean): void {
  try {
    window.localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* quota */
  }
  document.documentElement.classList.toggle("dark", on);
}

// Apply dark mode ASAP on script load so we don't get a light-mode flash on
// first paint. Called from main.tsx before <App /> mounts.
export function applyDarkModeAtBoot(): void {
  document.documentElement.classList.toggle("dark", initialDarkMode());
}
