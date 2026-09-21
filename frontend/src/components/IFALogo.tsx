/**
 * Insight Fusion Analytics brand mark.
 *
 * Purple gradient "IFA" wordmark on a rounded white tile - the same design
 * used in /public/favicon.svg. Rendered inline so it scales crisply at any
 * pixel size, respects `size` in Tailwind units, and works on both light
 * and dark backgrounds without an image round-trip.
 *
 * Use anywhere the app needs the IFA mark (sidebar header, auth cards,
 * empty states, footer). Prefer this over the raster favicon files.
 */

interface IFALogoProps {
  /** Tailwind size class token, e.g. "size-7" (default), "size-10", "size-14". */
  sizeClass?: string;
  /** Optional extra classes for the wrapper (margin, ring, shadow, etc.). */
  className?: string;
  /** When true, drops the white tile and paints the letters on a transparent
   *  background - useful on the marketing hero where the mark reads against
   *  the page's own dark canvas. */
  transparent?: boolean;
  /** Accessibility label. Omit and set aria-hidden on the parent to hide. */
  title?: string;
}

export default function IFALogo({
  sizeClass = "size-7",
  className = "",
  transparent = false,
  title = "Insight Fusion Analytics",
}: IFALogoProps) {
  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden ${
        transparent ? "" : "bg-white rounded-lg shrink-0"
      } ${sizeClass} ${className}`}
      role="img"
      aria-label={title}
    >
      <svg
        viewBox="0 0 128 128"
        className="w-full h-full"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="ifa-brand-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a89aff" />
            <stop offset="55%" stopColor="#7c6cff" />
            <stop offset="100%" stopColor="#5b46d6" />
          </linearGradient>
        </defs>
        <text
          x="64"
          y="86"
          fontFamily="Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
          fontWeight={900}
          fontSize={58}
          fill="url(#ifa-brand-grad)"
          textAnchor="middle"
          letterSpacing="-3"
        >
          IFA
        </text>
      </svg>
    </span>
  );
}
