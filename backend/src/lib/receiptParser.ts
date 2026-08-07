export interface ParsedReceipt {
  merchant: string | null;
  date: string | null;
  total: string | null;
  currency: string | null;
  items: string[];
  flags: string[];
}

const CURRENCY_SYMBOLS: Record<string, string> = {
  "$": "USD",
  "€": "EUR",
  "£": "GBP",
  "₦": "NGN",
  "₹": "INR",
  "¥": "JPY",
};
const CURRENCY_CODES = ["USD", "EUR", "GBP", "NGN", "INR", "JPY", "KES", "GHS", "ZAR", "CAD", "AUD"];

const TOTAL_LINE_PATTERN = /(grand\s*total|total\s*due|amount\s*due|balance\s*due|total)\b[^0-9]{0,12}([0-9][0-9,]*\.?[0-9]{0,2})/i;
const MONEY_PATTERN = /(?:[$€£₦₹¥]|USD|EUR|GBP|NGN|INR)?\s*([0-9]{1,3}(?:[,.][0-9]{3})*(?:\.[0-9]{2})?)/;

const DATE_PATTERNS = [
  /\b(\d{4}-\d{2}-\d{2})\b/, // 2026-01-05
  /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/, // 05/01/2026 or 1/5/26
  /\b(\d{1,2}-\d{1,2}-\d{2,4})\b/, // 05-01-2026
  /\b([A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})\b/, // Jan 5, 2026 / January 5 2026
  /\b(\d{1,2}\s+[A-Za-z]{3,9}\.?\s+\d{4})\b/, // 5 Jan 2026
];

const SKIP_LINE_PATTERN =
  /^(subtotal|sub-total|total|tax|vat|change|cash|card|balance|amount due|thank you|receipt|invoice|tel|phone|www\.|http)/i;

/**
 * Best-effort structured extraction from raw OCR text. This is deliberately
 * heuristic/regex-based rather than a specialized ML receipt parser — Vision's
 * free-tier OCR gives us text, not pre-structured fields, and a dedicated
 * receipt/expense parser (e.g. Document AI's Expense Parser) is a separate,
 * paid product. Good enough to flag obvious mismatches for a human reviewer,
 * which is this component's actual job.
 */
export function parseReceiptText(rawText: string): ParsedReceipt {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const flags: string[] = [];

  // --- Merchant: conventionally the first substantial line of a receipt ---
  const merchantLine = lines.find((l) => l.length >= 3 && !/^\d+$/.test(l) && !SKIP_LINE_PATTERN.test(l));
  const merchant = merchantLine ?? null;
  if (!merchant) flags.push("Could not detect a merchant name");

  // --- Total ---
  let total: string | null = null;
  const totalLineMatch = rawText.match(TOTAL_LINE_PATTERN);
  if (totalLineMatch) {
    total = totalLineMatch[2];
  } else {
    // Fallback: the largest money-shaped number anywhere in the text.
    const amounts = [...rawText.matchAll(new RegExp(MONEY_PATTERN, "g"))]
      .map((m) => parseFloat(m[1].replace(/,/g, "")))
      .filter((n) => !Number.isNaN(n));
    if (amounts.length > 0) total = Math.max(...amounts).toFixed(2);
  }
  if (!total) flags.push("Could not detect a total amount on the receipt");

  // --- Currency ---
  let currency: string | null = null;
  for (const [symbol, code] of Object.entries(CURRENCY_SYMBOLS)) {
    if (rawText.includes(symbol)) {
      currency = code;
      break;
    }
  }
  if (!currency) {
    const codeMatch = CURRENCY_CODES.find((code) => new RegExp(`\\b${code}\\b`, "i").test(rawText));
    if (codeMatch) currency = codeMatch.toUpperCase();
  }
  if (!currency) flags.push("Could not detect a currency");

  // --- Date ---
  let date: string | null = null;
  for (const pattern of DATE_PATTERNS) {
    const match = rawText.match(pattern);
    if (match) {
      date = match[1];
      break;
    }
  }
  if (!date) flags.push("Could not detect a date on the receipt");

  // --- Line items: "<description> ... <price>" style lines, excluding totals/tax/etc. ---
  const items: string[] = [];
  for (const line of lines) {
    if (SKIP_LINE_PATTERN.test(line)) continue;
    if (line === merchant) continue;
    const priceMatch = line.match(/([0-9]{1,3}(?:[,.][0-9]{3})*\.[0-9]{2})\s*$/);
    if (priceMatch) {
      items.push(line);
      if (items.length >= 8) break;
    }
  }

  return { merchant, date, total, currency, items, flags };
}
