/**
 * Mirrors the fields Reloadly returns from GET /operators/countries/{isoCode}
 * (see https://developers.reloadly.com/ — Topups API, "Operators" section).
 * Kept as a hand-written subset since we don't have a generated SDK here.
 */
export interface ReloadlyOperator {
  id: number;
  name: string;
  /** True when this operator entry represents a mobile data bundle SKU rather than plain airtime. */
  data: boolean;
  /** True when the product is a bundled package (data + minutes, etc.) rather than a single top-up. */
  bundle: boolean;
  /** "FIXED" -> pick from fixedAmounts; "RANGE" -> any custom amount between min/max. */
  denominationType: "FIXED" | "RANGE";
  fixedAmounts: number[]; // USD-denominated (since we call the API with useLocalAmount=false)
  minAmount: number | null;
  maxAmount: number | null;
  /** amount (as string) -> human description, e.g. { "5": "1GB - Valid 30 days" }. Present for many data bundles. */
  fixedAmountsDescriptions?: Record<string, string>;
  /** Same denominations as fixedAmounts, but in the destination country's local currency — this is what we show as the primary price. */
  localFixedAmounts?: number[];
  /** Local-currency equivalent of fixedAmountsDescriptions, keyed by the local amount. */
  localFixedAmountsDescriptions?: Record<string, string>;
  localMinAmount?: number | null;
  localMaxAmount?: number | null;
  /** ISO 4217 code for the destination country's local currency, e.g. "NGN". */
  localCurrencyCode?: string | null;
  logoUrls: string[];
  country: { isoName: string; name: string };
}
