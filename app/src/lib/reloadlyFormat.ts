/**
 * Reloadly operator descriptions often bake the plan name and the local
 * denomination straight into the string, e.g.:
 *   "Talkmore_N100 - 10 Mins - 3days"
 *   "Flexi_N2000 - 40mins + 2.5GB + 5 SMS - 30days"
 * That's redundant once we're already showing the amount as its own price —
 * this strips the "<PlanName>_<CODE><digits> - " prefix (if present) and
 * adds back the spacing telecom copy tends to drop ("30days" -> "30 days").
 * Descriptions that don't match the messy pattern (many operators return
 * clean ones already) pass through unchanged.
 */
export function cleanPackageDescription(description: string): string {
  const withoutPrefix = description.replace(/^(?:[A-Za-z]+_)?[A-Z]{1,4}\d+\s*[-–]\s*/, "");
  return withoutPrefix.replace(/(\d)([A-Za-z])/g, "$1 $2").trim();
}

/** ISO 4217 code -> display symbol, for the countries/currencies vLitePay's top-up flow supports. */
const CURRENCY_SYMBOLS: Record<string, string> = {
  NGN: "₦",
  PHP: "₱",
  KES: "KSh",
  GHS: "GH₵",
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
};

export function currencySymbol(code?: string | null): string {
  if (!code) return "";
  return CURRENCY_SYMBOLS[code.toUpperCase()] ?? `${code.toUpperCase()} `;
}

/** Formats a local-currency amount with its symbol, e.g. formatLocalAmount(100, "NGN") -> "₦100". */
export function formatLocalAmount(amount: number, code?: string | null): string {
  const symbol = currencySymbol(code);
  const formatted = amount.toLocaleString(undefined, { maximumFractionDigits: 2 });
  // Symbols we render as a prefix with no gap ("₦100"); ISO-code fallbacks
  // ("KES ") already carry a trailing space from currencySymbol().
  return `${symbol}${formatted}`;
}
