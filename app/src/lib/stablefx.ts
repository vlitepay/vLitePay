import "server-only";
import { formatUnits, parseUnits } from "viem";
import { TOKENS } from "@/lib/constants";
import type { SwappableToken } from "@/lib/constants";

/**
 * SERVER-ONLY client for Circle's StableFX API — off-chain RFQ quote, then
 * an on-chain PvP trade settled via Circle's FxEscrow contract pulling
 * funds through a Permit2 signature. NOT a custom AMM — v1 wires
 * USDC<->EURC only, per the current brief; cirBTC is intentionally
 * excluded (not executable).
 *
 * ENDPOINTS (per Circle's official StableFX docs):
 *   Sandbox base : https://api-sandbox.circle.com   (default)
 *   Live base    : https://api.circle.com           (STABLEFX_API_BASE_URL override)
 *   POST /v1/exchange/stablefx/quotes   — create an RFQ quote
 *   POST /v1/exchange/stablefx/trades   — create a trade from quoteId + Permit2 message + signature
 *   GET  /v1/exchange/stablefx/trades   — list trades (listStableFxTrades below; not wired to any UI yet)
 *
 * CONFIG-GATED, NOT SIMULATED: every export here checks isStableFxConfigured()
 * first and returns a typed "not configured" result rather than a fabricated
 * quote/rate. There is no mock/fallback rate anywhere in this file — if
 * STABLEFX_API_KEY (or NEXT_PUBLIC_FX_ESCROW_ADDRESS) is unset, callers get
 * a clear "not configured" signal, never a number that looks like a real
 * quote. Every network call is try/caught by its caller and surfaces a
 * clear provider error rather than pretending to succeed.
 *
 * RESPONSE-SHAPE NOTE: the request bodies below (from/to currency+amount,
 * type: "tradable", recipientAddress, tenor) match the fields Circle's docs
 * specify. The exact response JSON keys for quotes/trades were not fully
 * enumerated in what was shared with this project, so normalizeQuote()
 * below reads the most likely field names (mirroring the request's
 * from/to shape) with fallbacks — confirm against a live sandbox response
 * and adjust normalizeQuote() if Circle's actual field names differ before
 * relying on this in production.
 */

const STABLEFX_API_BASE_URL = process.env.STABLEFX_API_BASE_URL || "https://api-sandbox.circle.com";

export function isStableFxConfigured(): boolean {
  return !!process.env.STABLEFX_API_KEY && !!process.env.NEXT_PUBLIC_FX_ESCROW_ADDRESS;
}

export interface StableFxQuoteRequest {
  fromToken: SwappableToken;
  toToken: SwappableToken;
  /** Smallest-unit string (matches this app's bigint.toString() convention elsewhere) — converted to a decimal string for Circle's `from.amount` field. */
  amount: string;
  walletAddress: `0x${string}`;
  /** Per Circle's docs: required, one of these three, never "spot". Defaults to "instant" below if omitted. */
  tenor?: StableFxTenor;
}

export type StableFxTenor = "instant" | "hourly" | "daily";

export interface StableFxQuote {
  quoteId: string;
  fromToken: string;
  toToken: string;
  /** Smallest-unit strings, converted back from Circle's decimal amounts using each token's known decimals. */
  fromAmount: string;
  toAmount: string;
  rate: string;
  feeAmount: string;
  expiresAt: string;
  /**
   * Circle's exact EIP-712 payload for accepting this quote, passed
   * through completely unmodified from the quote response — domain,
   * types, primaryType, and message (which includes the witness:
   * consideration/recipient/fee/authorizer, per Circle's Create Trade
   * requirements). Sign this whole object as-is; never reconstruct it.
   * Quotes expire in ~3-4 seconds, so this is only valid for a very short
   * window (see quote.expiresAt) — accept.ts re-quotes automatically if
   * it's gone stale by the time the user confirms.
   */
  typedData: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
  };
}

export interface StableFxAcceptResult {
  status: "settled" | "pending";
  txHash?: string;
}

/** Thrown for any StableFX call attempted while config is missing — callers should check isStableFxConfigured() first and never call these directly in that state, but this is the hard backstop. */
export class StableFxNotConfiguredError extends Error {
  constructor() {
    super("StableFX is not configured on this environment (STABLEFX_API_KEY / NEXT_PUBLIC_FX_ESCROW_ADDRESS missing).");
    this.name = "StableFxNotConfiguredError";
  }
}

/**
 * Carries Circle's exact status + response body through to the API route,
 * which forwards both to the client as-is instead of collapsing every
 * failure into a generic 502. Lets the Swap UI (or whoever's debugging)
 * see Circle's real error code/message/errId directly.
 */
export class StableFxApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    const message =
      body && typeof body === "object" && typeof (body as any).message === "string"
        ? (body as any).message
        : `StableFX request failed (${status})`;
    super(message);
    this.name = "StableFxApiError";
    this.status = status;
    this.body = body;
  }
}

function authHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.STABLEFX_API_KEY}`,
  };
}

function safeJsonParse(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Shared validator: any 0x-prefixed hex string, narrowed to the `0x${string}` type the rest of this file (and its API routes) expect for addresses/signatures. */
export function isHexString(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]*$/.test(value);
}

/**
 * Maps Circle's quote response onto this app's internal StableFxQuote
 * shape. Circle's actual response envelope/field names weren't confirmed
 * before this went live, so every value is resolved defensively across
 * several candidate shapes/keys — see the numbered comments below — and
 * parseUnits() is only ever called on a value that's actually present.
 */
function normalizeQuote(rawResponse: any, fromToken: SwappableToken, toToken: SwappableToken): StableFxQuote {
  // 1. Log the exact JSON Circle returned, before any normalization, so a
  // shape mismatch can be diagnosed from server logs instead of guessed at.
  console.log("[stablefx] raw quote response", rawResponse);

  // 2. Circle may or may not wrap the payload in `{ data: {...} }` — same
  // envelope convention already handled for other Circle endpoints in this
  // codebase (see app/api/circle/session/route.ts).
  const raw = rawResponse?.data ?? rawResponse ?? {};

  const quoteId = raw.quoteId ?? raw.id;
  const expiresAt = raw.expiration ?? raw.expiresAt ?? raw.expiresOn;

  // 5. Resolve each side's currency string first — only then look up
  // TOKENS[...].decimals from it, rather than blindly trusting the
  // fromToken/toToken this function was called with.
  const fromCurrency = (raw.from?.currency as SwappableToken) ?? fromToken;
  const toCurrency = (raw.to?.currency as SwappableToken) ?? toToken;
  const fromDecimals = TOKENS[fromCurrency]?.decimals ?? TOKENS[fromToken].decimals;
  const toDecimals = TOKENS[toCurrency]?.decimals ?? TOKENS[toToken].decimals;

  // 2. Try from.amount/to.amount first, then several alternate top-level
  // field names Circle (or a proxy in front of it) might use instead.
  const fromAmountDecimal = raw.from?.amount ?? raw.fromAmount ?? raw.sourceAmount;
  const toAmountDecimal = raw.to?.amount ?? raw.toAmount ?? raw.destinationAmount;

  // 3. Never call parseUnits on a missing value — if Circle omitted an
  // amount (e.g. `to.amount` when only `from.amount` was quoted), leave it
  // as an empty string rather than crashing or fabricating a number.
  const fromAmount = isPresent(fromAmountDecimal) ? parseUnits(String(fromAmountDecimal), fromDecimals).toString() : "";
  const toAmount = isPresent(toAmountDecimal) ? parseUnits(String(toAmountDecimal), toDecimals).toString() : "";

  // 4. Fee (and collateral, handled identically) can come back as a plain
  // string/number or as an { amount, currency } object.
  const feeAmount = resolveAmountLikeField(raw.fee ?? raw.collateral, fromCurrency, fromDecimals);

  // Accepting this quote later requires signing Circle's EXACT typedData
  // (domain/types/primaryType/message, including the witness) — passed
  // through completely unmodified, never reconstructed. Without it the
  // trade can't be accepted, so surface that clearly now rather than
  // failing confusingly at accept time.
  const typedData = raw.typedData;
  if (!typedData || typeof typedData !== "object") {
    throw new Error("StableFX quote response is missing typedData required to sign and accept the trade.");
  }

  return {
    quoteId: quoteId !== undefined ? String(quoteId) : "",
    fromToken: fromCurrency ? String(fromCurrency) : fromToken,
    toToken: toCurrency ? String(toCurrency) : toToken,
    fromAmount,
    toAmount,
    rate: String(raw.rate ?? raw.exchangeRate ?? ""),
    feeAmount,
    expiresAt: expiresAt !== undefined ? String(expiresAt) : "",
    typedData,
  };
}

function isPresent(value: unknown): value is string | number {
  return value !== undefined && value !== null && value !== "";
}

/**
 * Resolves a fee/collateral-like field that Circle may return as a bare
 * string/number, or as `{ amount, currency }` (in which case its own
 * currency's decimals are used instead of the default). Never throws on a
 * missing value — returns "0" instead.
 */
function resolveAmountLikeField(value: any, defaultCurrency: SwappableToken, defaultDecimals: number): string {
  if (value === undefined || value === null) return "0";
  if (typeof value === "object") {
    if (!isPresent(value.amount)) return "0";
    const currency = (value.currency as SwappableToken) ?? defaultCurrency;
    const decimals = TOKENS[currency]?.decimals ?? defaultDecimals;
    return parseUnits(String(value.amount), decimals).toString();
  }
  if (!isPresent(value)) return "0";
  return parseUnits(String(value), defaultDecimals).toString();
}

export async function getStableFxQuote(req: StableFxQuoteRequest): Promise<StableFxQuote> {
  if (!isStableFxConfigured()) throw new StableFxNotConfiguredError();

  const fromAmountDecimal = formatUnits(BigInt(req.amount), TOKENS[req.fromToken].decimals);
  // Circle's Create Quote API: amount goes on `from` only (never both sides),
  // currencies are plain USDC/EURC strings (not token addresses), and — per
  // Circle's docs — quote requests must NOT include idempotencyKey; that
  // belongs to trade creation (acceptStableFxQuote below), not quotes.
  const requestBody = {
    from: { currency: req.fromToken, amount: fromAmountDecimal },
    to: { currency: req.toToken },
    type: "tradable",
    recipientAddress: req.walletAddress,
    tenor: req.tenor ?? "instant",
  };

  // Logged server-side only (never sent to the client) — exactly what was
  // POSTed to Circle, for correlating against Circle's own errId/dashboard.
  console.log("[stablefx] outbound quote request", requestBody);

  const res = await fetch(`${STABLEFX_API_BASE_URL}/v1/exchange/stablefx/quotes`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const rawText = await res.text().catch(() => "");
    const parsed = safeJsonParse(rawText);
    console.error("[stablefx] quote request rejected", {
      status: res.status,
      sentBody: requestBody,
      circleResponse: parsed ?? rawText,
    });
    throw new StableFxApiError(res.status, parsed ?? { message: rawText || res.statusText });
  }

  const raw = await res.json();
  return normalizeQuote(raw, req.fromToken, req.toToken);
}

/**
 * Step 2: create a trade from the accepted quoteId + the wallet's EIP-712
 * signature of Circle's exact typedData (see StableFxQuote.typedData —
 * signed as-is, never reconstructed). Circle's Create Trade API:
 *   POST /v1/exchange/stablefx/trades
 *   { idempotencyKey, quoteId, address, message, signature }
 * — `message` here is `quote.typedData.message` UNCHANGED (including the
 * witness: consideration/recipient/fee/authorizer); domain is NOT nested
 * inside it. Circle's side executes the PvP settlement via FxEscrow
 * against that signature and returns the resulting on-chain outcome.
 */
export async function acceptStableFxQuote(input: {
  quoteId: string;
  address: `0x${string}`;
  message: Record<string, unknown>;
  signature: `0x${string}`;
}): Promise<StableFxAcceptResult> {
  if (!isStableFxConfigured()) throw new StableFxNotConfiguredError();

  const requestBody = {
    idempotencyKey: crypto.randomUUID(),
    quoteId: input.quoteId,
    address: input.address,
    message: input.message,
    signature: input.signature,
  };

  // Logged server-side only — signature redacted, everything else exactly
  // as sent to Circle, for correlating against Circle's own errId/dashboard.
  console.log("[stablefx] outbound trade request", { ...requestBody, signature: "[redacted]" });

  const res = await fetch(`${STABLEFX_API_BASE_URL}/v1/exchange/stablefx/trades`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(requestBody),
  });

  if (!res.ok) {
    const rawText = await res.text().catch(() => "");
    const parsed = safeJsonParse(rawText);
    console.error("[stablefx] trade request rejected", {
      status: res.status,
      sentBody: requestBody,
      circleResponse: parsed ?? rawText,
    });
    throw new StableFxApiError(res.status, parsed ?? { message: rawText || res.statusText });
  }

  const raw = await res.json();
  return {
    status: raw.status === "settled" || raw.txHash ? "settled" : "pending",
    txHash: raw.txHash ?? raw.transactionHash,
  };
}

/**
 * GET /v1/exchange/stablefx/trades — listed per Circle's docs. Not called
 * from any route or UI yet (no trade-history view exists for Swap); kept
 * here so the lib fully mirrors the documented endpoint surface.
 */
export async function listStableFxTrades(): Promise<unknown[]> {
  if (!isStableFxConfigured()) throw new StableFxNotConfiguredError();

  const res = await fetch(`${STABLEFX_API_BASE_URL}/v1/exchange/stablefx/trades`, {
    method: "GET",
    headers: authHeaders(),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`StableFX trade list request failed (${res.status}): ${detail || res.statusText}`);
  }

  const raw = await res.json();
  return Array.isArray(raw) ? raw : raw.trades ?? [];
}
