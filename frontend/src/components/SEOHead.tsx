/**
 * Per-route SEO metadata. Uses React 19's native metadata hoisting — any
 * <title>, <meta>, <link>, <script type="application/ld+json"> rendered
 * inside a component gets moved to <head> automatically. No react-helmet
 * dependency required.
 *
 * Every SEO-relevant page renders <SEOHead ...props />. The base index.html
 * carries the default title/description as a fallback; per-page values here
 * override.
 *
 * `robots: "noindex"` is the default because every route except the public
 * landing is auth-gated. The landing explicitly opts in with `robots="index, follow"`.
 */

// Runtime-configured site URL — swaps to any domain with an env change,
// no code edit needed. Falls back to the previous prod host so any
// stale build during transition still produces valid links.
const SITE = (import.meta.env.VITE_SITE_URL as string | undefined)
  ?? "https://backtestingengine.insightfusionanalytics.com";

export default function SEOHead({
  title,
  description,
  path = "/",
  robots = "noindex, nofollow",
  ogImage,
  structuredData,
}: {
  title: string;
  description: string;
  path?: string;
  robots?: string;
  ogImage?: string;
  structuredData?: object | object[];
}) {
  const canonical = `${SITE}${path}`;
  const image = ogImage
    ? (ogImage.startsWith("http") ? ogImage : `${SITE}${ogImage}`)
    : `${SITE}/og-image.png`;
  const jsonLd = Array.isArray(structuredData) ? structuredData : structuredData ? [structuredData] : [];
  return (
    <>
      <title>{title}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />
      <meta name="robots" content={robots} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={canonical} />
      <meta property="og:image" content={image} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={image} />
      {jsonLd.map((data, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
        />
      ))}
    </>
  );
}
