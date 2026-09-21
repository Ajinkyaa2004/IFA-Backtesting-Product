/**
 * Country dialing codes for the signup form.
 *
 * We intentionally keep this a curated list (~40 common markets) rather than a
 * full ISO catalog. A giant select is worse UX than a well-ordered short list -
 * anyone in a market not on the list can still type their number and select
 * "Other" as their code.
 *
 * Ordered as: India first (majority of current onboardings), then major English-
 * speaking markets, then the rest alphabetical by country name. Numeric codes
 * are strings so the "+" is always in the label but the value stays clean.
 */

export type CountryCode = {
  /** ISO 3166-1 alpha-2 country code, uppercase. */
  iso: string;
  /** International dialing prefix, without the "+". e.g. "91", "1", "44". */
  dial: string;
  /** Human name for the option label. */
  name: string;
  /** Unicode flag emoji. */
  flag: string;
};

export const COUNTRY_CODES: CountryCode[] = [
  { iso: "IN", dial: "91",  name: "India",                flag: "🇮🇳" },
  { iso: "US", dial: "1",   name: "United States",        flag: "🇺🇸" },
  { iso: "GB", dial: "44",  name: "United Kingdom",       flag: "🇬🇧" },
  { iso: "AE", dial: "971", name: "United Arab Emirates", flag: "🇦🇪" },
  { iso: "SG", dial: "65",  name: "Singapore",            flag: "🇸🇬" },
  { iso: "AU", dial: "61",  name: "Australia",            flag: "🇦🇺" },
  { iso: "CA", dial: "1",   name: "Canada",               flag: "🇨🇦" },
  { iso: "DE", dial: "49",  name: "Germany",              flag: "🇩🇪" },
  { iso: "FR", dial: "33",  name: "France",               flag: "🇫🇷" },
  { iso: "HK", dial: "852", name: "Hong Kong",            flag: "🇭🇰" },
  { iso: "IE", dial: "353", name: "Ireland",              flag: "🇮🇪" },
  { iso: "IL", dial: "972", name: "Israel",               flag: "🇮🇱" },
  { iso: "JP", dial: "81",  name: "Japan",                flag: "🇯🇵" },
  { iso: "MY", dial: "60",  name: "Malaysia",             flag: "🇲🇾" },
  { iso: "NL", dial: "31",  name: "Netherlands",          flag: "🇳🇱" },
  { iso: "NZ", dial: "64",  name: "New Zealand",          flag: "🇳🇿" },
  { iso: "NG", dial: "234", name: "Nigeria",              flag: "🇳🇬" },
  { iso: "NO", dial: "47",  name: "Norway",               flag: "🇳🇴" },
  { iso: "PK", dial: "92",  name: "Pakistan",             flag: "🇵🇰" },
  { iso: "PH", dial: "63",  name: "Philippines",          flag: "🇵🇭" },
  { iso: "PL", dial: "48",  name: "Poland",               flag: "🇵🇱" },
  { iso: "PT", dial: "351", name: "Portugal",             flag: "🇵🇹" },
  { iso: "QA", dial: "974", name: "Qatar",                flag: "🇶🇦" },
  { iso: "SA", dial: "966", name: "Saudi Arabia",         flag: "🇸🇦" },
  { iso: "ZA", dial: "27",  name: "South Africa",         flag: "🇿🇦" },
  { iso: "KR", dial: "82",  name: "South Korea",          flag: "🇰🇷" },
  { iso: "ES", dial: "34",  name: "Spain",                flag: "🇪🇸" },
  { iso: "SE", dial: "46",  name: "Sweden",               flag: "🇸🇪" },
  { iso: "CH", dial: "41",  name: "Switzerland",          flag: "🇨🇭" },
  { iso: "TW", dial: "886", name: "Taiwan",               flag: "🇹🇼" },
  { iso: "TH", dial: "66",  name: "Thailand",             flag: "🇹🇭" },
  { iso: "TR", dial: "90",  name: "Turkey",               flag: "🇹🇷" },
  { iso: "VN", dial: "84",  name: "Vietnam",              flag: "🇻🇳" },
  { iso: "BR", dial: "55",  name: "Brazil",               flag: "🇧🇷" },
  { iso: "MX", dial: "52",  name: "Mexico",               flag: "🇲🇽" },
  { iso: "ID", dial: "62",  name: "Indonesia",            flag: "🇮🇩" },
  { iso: "IT", dial: "39",  name: "Italy",                flag: "🇮🇹" },
  { iso: "CN", dial: "86",  name: "China",                flag: "🇨🇳" },
  { iso: "BD", dial: "880", name: "Bangladesh",           flag: "🇧🇩" },
  { iso: "LK", dial: "94",  name: "Sri Lanka",            flag: "🇱🇰" },
];

/** Default when the form first mounts. India remains the sane default given
 *  the current onboarding mix; the client picks anything else in one click. */
export const DEFAULT_COUNTRY_ISO = "IN";
