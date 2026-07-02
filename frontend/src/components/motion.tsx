import { type ReactNode } from "react";
import { motion, type MotionProps } from "framer-motion";
import { pageTransition, revealUp, staggerContainer } from "../lib/motion";

/**
 * Small collection of motion primitives used across the app. All animations
 * flow through these so the tokens in lib/motion.ts are the only place to
 * tweak timings.
 */

/** Wrap the current route's contents. Handles fade + slight-up on mount. */
export function PageTransition({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={pageTransition}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {children}
    </motion.div>
  );
}

/** Reveal a single element on mount or when it scrolls into view. */
export function Reveal({
  children,
  className,
  delay = 0,
  onView = false,
  ...rest
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  /** When true, reveal only when scrolled into view (once). Default is mount. */
  onView?: boolean;
} & MotionProps) {
  const trigger = onView
    ? { whileInView: "visible", viewport: { once: true, margin: "-40px" } }
    : { animate: "visible" };
  return (
    <motion.div
      className={className}
      variants={revealUp}
      initial="hidden"
      transition={{ delay }}
      {...trigger}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

/**
 * Container that staggers its <Reveal>-like children on mount. Wrap a list.
 * Each direct child that has variants=hidden/visible will delay-cascade.
 */
export function StaggerReveal({
  children,
  className,
  stagger = 0.05,
  delayChildren = 0,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
  delayChildren?: number;
}) {
  return (
    <motion.div
      className={className}
      variants={staggerContainer(stagger, delayChildren)}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}

/** Reveal that participates in a StaggerReveal. Mount-time only, no scroll trigger. */
export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={revealUp}>
      {children}
    </motion.div>
  );
}
