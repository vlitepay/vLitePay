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
  /** RFQ tenor — TODO: confirm the exact enum Circle expects; "spot" is the placeholder used until confirmed against live docs/sandbox. */
  tenor?: string;
}

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
}

export interface StableFxPermit2Payload {
  domain: { name: string; chainId: number; verifyingContract: `0x${string}` };
  permitted: { token: `0x${string}`; amount: string };
  spender: `0x${string}`;
  nonce: string;
  deadline: string;
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

function authHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${process.env.STABLEFX_API_KEY}`,
  };
}

/** Shared validator: any 0x-prefixed hex string, narrowed to the `0x${string}` type the rest of this file (and its API routes) expect for addresses/signatures. */
export function isHexString(value: unknown): value is `0x${string}` {
  return typeof value === "string" && /^0x[0-9a-fA-F]*$/.test(value);
}

/**
 * Maps Circle's quote response onto this app's internal StableFxQuote
 * shape. Reads the most likely field names per the from/to request
 * convention described in Circle's docs, with defensive fallbacks — see
 * the file-level RESPONSE-SHAPE NOTE above.
 */
function normalizeQuote(raw: any, fromToken: SwappableToken, toToken: SwappableToken): StableFxQuote {
  const quoteId = raw.quoteId ?? raw.id;
  const fromAmountDecimal = raw.from?.amount ?? raw.fromAmount;
  const toAmountDecimal = raw.to?.amount ?? raw.toAmount;
  const expiresAt = raw.expiration ?? raw.expiresAt ?? raw.expiresOn;

  return {
    quoteId,
    fromToken: raw.from?.currency ?? fromToken,
    toToken: raw.to?.currency ?? toToken,
    fromAmount: parseUnits(String(fromAmountDecimal), TOKENS[fromToken].decimals).toString(),
    toAmount: parseUnits(String(toAmountDecimal), TOKENS[toToken].decimals).toString(),
    rate: String(raw.rate ?? raw.exchangeRate ?? ""),
    feeAmount: raw.fee !== undefined ? parseUnits(String(raw.fee), TOKENS[fromToken].decimals).toString() : "0",
    expiresAt: String(expiresAt),
  };
}

export async function getStableFxQuote(req: StableFxQuoteRequest): Promise<StableFxQuote> {
  if (!isStableFxConfigured()) throw new StableFxNotConfiguredError();

  const fromAmountDecimal = formatUnits(BigInt(req.amount), TOKENS[req.fromToken].decimals);

  const res = await fetch(`${STABLEFX_API_BASE_URL}/v1/exchange/stablefx/quotes`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      from: { currency: req.fromToken, amount: fromAmountDecimal },
      to: { currency: req.toToken },
      type: "tradable",
      recipientAddress: req.walletAddress,
      tenor: req.tenor ?? "spot",
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`StableFX quote request failed (${res.status}): ${detail || res.statusText}`);
  }

  const raw = await res.json();
  return normalizeQuote(raw, req.fromToken, req.toToken);
}

/**
 * Step 2: create a trade from the accepted quoteId + the user's signed
 * Permit2 authorization. Circle's side executes the PvP settlement via
 * FxEscrow against that signature and returns the resulting on-chain
 * outcome.
 */
export async function acceptStableFxQuote(input: {
  quoteId: string;
  permit: StableFxPermit2Payload;
  signature: `0x${string}`;
}): Promise<StableFxAcceptResult> {
  if (!isStableFxConfigured()) throw new StableFxNotConfiguredError();

  const res = await fetch(`${STABLEFX_API_BASE_URL}/v1/exchange/stablefx/trades`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      idempotencyKey: crypto.randomUUID(),
      quoteId: input.quoteId,
      // Field name TODO: confirm against live docs/sandbox — Circle's docs
      // describe the trade body as "quoteId + Permit2 message + signature"
      // without giving the literal JSON keys for the message/signature pair.
      permit2Message: input.permit,
      signature: input.signature,
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`StableFX trade creation failed (${res.status}): ${detail || res.statusText}`);
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
