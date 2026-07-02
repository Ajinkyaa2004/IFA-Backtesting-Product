/**
 * Motion tokens. Single source of truth for easings, durations, and reusable
 * variants so every animation across the product feels consistent.
 *
 * Design philosophy:
 *   * Fast enough not to feel slow — no transition >350ms
 *   * Consistent easing — one primary curve for everything
 *   * Purposeful — animation draws attention, doesn't decorate
 *   * Reduced-motion friendly — respect the OS setting
 *
 * The public API is DURATION, EASE, and a small library of Variants. Anything
 * calling framer-motion should import from here instead of defining its own
 * timings inline.
 */

import type { Variants } from "framer-motion";

// Standard product easing — matches Apple/Vercel/Linear feel. Slight ease-out
// so motion decelerates into place rather than snapping.
export const EASE = {
  standard: [0.32, 0.72, 0, 1] as [number, number, number, number],
  emphasis: [0.4, 0.0, 0.2, 1] as [number, number, number, number],
} as const;

// Kept in a narrow band so nothing feels sluggish.
export const DURATION = {
  fast: 0.16,
  base: 0.24,
  slow: 0.32,
} as const;

/** Route/page-level transition. Subtle fade + tiny slide-up. */
export const pageTransition: Variants = {
  hidden:  { opacity: 0, y: 6 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE.standard } },
  exit:    { opacity: 0, y: -6, transition: { duration: DURATION.fast, ease: EASE.standard } },
};

/** Card / section reveal — used on scroll or first mount. */
export const revealUp: Variants = {
  hidden:  { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE.standard } },
};

/** Container that staggers its children. Wrap a list of Reveal items in this. */
export function staggerContainer(staggerChildren = 0.05, delayChildren = 0): Variants {
  return {
    hidden: {},
    visible: {
      transition: { staggerChildren, delayChildren },
    },
  };
}

/** Modal / popover open — scale from origin + fade. */
export const modalScale: Variants = {
  hidden:  { opacity: 0, scale: 0.96, y: 6 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: DURATION.base, ease: EASE.standard } },
  exit:    { opacity: 0, scale: 0.96, y: 6, transition: { duration: DURATION.fast, ease: EASE.standard } },
};

/** Backdrop for modals — fade only. */
export const backdropFade: Variants = {
  hidden:  { opacity: 0 },
  visible: { opacity: 1, transition: { duration: DURATION.fast } },
  exit:    { opacity: 0, transition: { duration: DURATION.fast } },
};

/** Dropdown open — origin-aware scale + fade. */
export const dropdownScale: Variants = {
  hidden:  { opacity: 0, scale: 0.96, y: -4 },
  visible: { opacity: 1, scale: 1, y: 0, transition: { duration: DURATION.fast, ease: EASE.standard } },
  exit:    { opacity: 0, scale: 0.96, y: -4, transition: { duration: DURATION.fast * 0.6, ease: EASE.standard } },
};

/** Slide in from the right — used for drawers, toasts. */
export const slideInRight: Variants = {
  hidden:  { opacity: 0, x: 24 },
  visible: { opacity: 1, x: 0, transition: { duration: DURATION.base, ease: EASE.standard } },
  exit:    { opacity: 0, x: 24, transition: { duration: DURATION.fast, ease: EASE.standard } },
};

/** Banner/announcement — slide down from top with fade. */
export const slideDown: Variants = {
  hidden:  { opacity: 0, y: -12 },
  visible: { opacity: 1, y: 0, transition: { duration: DURATION.base, ease: EASE.standard } },
  exit:    { opacity: 0, y: -12, transition: { duration: DURATION.fast, ease: EASE.standard } },
};

/**
 * Whether the OS user has opted into reduced motion. Components can use this
 * to skip fancy animations while keeping the layout unchanged.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}
