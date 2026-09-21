/** "214 KB", "1.4 MB". Sizes under 1 KB fall back to bytes. */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Money from an integer amount in minor units (cents / paise), in the quote's
 * own currency: "$1,250.50", "₹1,50,000". Whole amounts drop the decimals;
 * anything else shows exactly two. USD groups in thousands and INR in the
 * Indian lakh/crore style. An unknown currency code falls back to plain text
 * instead of throwing.
 */
export function formatMoney(minorUnits: number, currency: string): string {
  const major = minorUnits / 100;
  const fraction = minorUnits % 100 === 0 ? 0 : 2;
  try {
    return new Intl.NumberFormat(currency === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: fraction,
      maximumFractionDigits: fraction,
    }).format(major);
  } catch {
    return `${currency} ${major.toLocaleString()}`;
  }
}
