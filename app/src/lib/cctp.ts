"use client";

/**
 * CCTP domain IDs — matches lib/constants.ts's CCTP_CHAINS exactly (Arc's
 * own domain, 26, added here since CCTP_CHAINS only lists destinations).
 * Verified against Circle's own docs (their Arc-specific quickstart uses
 * domain 26 explicitly): https://developers.circle.com/cctp/quickstarts/transfer-usdc-ethereum-to-arc
 */
export const CCTP_DOMAIN = {
  ethereum: 0,
  avalanche: 1, // Fuji testnet
  arbitrum: 3,
  base: 6,
  arc: 26,
} as const;

export type CctpDomainId = (typeof CCTP_DOMAIN)[keyof typeof CCTP_DOMAIN];

/** Per-destination-domain explorer base — used to build a "view mint on {chain}" link once we have a destination tx hash. */
const DESTINATION_EXPLORER_BASE: Record<number, string> = {
  [CCTP_DOMAIN.ethereum]: "https://sepolia.etherscan.io",
  [CCTP_DOMAIN.avalanche]: "https://testnet.snowtrace.io",
  [CCTP_DOMAIN.arbitrum]: "https://sepolia.arbiscan.io",
  [CCTP_DOMAIN.base]: "https://sepolia.basescan.org",
};

export function destinationExplorerTxUrl(domain: number, txHash: string): string | null {
  const base = DESTINATION_EXPLORER_BASE[domain];
  return base ? `${base}/tx/${txHash}` : null;
}

const IRIS_API_BASE = process.env.NEXT_PUBLIC_IRIS_API_URL || "https://iris-api-sandbox.circle.com";

export interface CctpFeeQuote {
  finalityThreshold: number;
  minimumFee: number;
  forwardFee?: { low: number; med: number; high: number };
}

/**
 * GET /v2/burn/USDC/fees/{source}/{dest}?forward=true — public, no API key
 * required. Returns an array with one entry per finality tier Circle
 * currently offers for this source/destination pair (fast=1000,
 * standard=2000) — an EMPTY array/response is Iris genuinely having
 * nothing for this domain pair right now (seen historically for newer
 * domains like Arc's 26), not an error to paper over. Callers must treat
 * that as "don't fake a quote," per the brief.
 */
export async function fetchCctpFeeQuotes(
  sourceDomain: number,
  destDomain: number,
  forward: boolean
): Promise<CctpFeeQuote[] | null> {
  try {
    const url = `${IRIS_API_BASE}/v2/burn/USDC/fees/${sourceDomain}/${destDomain}${forward ? "?forward=true" : ""}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null; // Iris empty — see above
    return data as CctpFeeQuote[];
  } catch {
    return null; // network error — same "don't fake it" treatment as an empty response
  }
}

/** Prefers the FAST (1000) tier if Circle actually returned one for this pair; otherwise the STANDARD (2000) tier. Matches "Arc as source Fast is N/A; if Fast fails use standard/forward quote." */
export function pickBestFeeQuote(quotes: CctpFeeQuote[]): CctpFeeQuote {
  return quotes.find((q) => q.finalityThreshold === 1000) ?? quotes.find((q) => q.finalityThreshold === 2000) ?? quotes[0];
}

export type CctpMessageStatus = "pending" | "complete" | "iris_empty" | "error";

export interface CctpMessageStatusResult {
  status: CctpMessageStatus;
  message?: string;
  attestation?: string;
}

/**
 * GET /v2/messages/{sourceDomain}?transactionHash=... — also public, no API
 * key. Used both to know when a Forwarding Service burn has been picked up
 * by Circle (status alone, no relay needed) and, for the plain-burn
 * fallback, to get the message+attestation the server relayer needs.
 */
export async function fetchCctpMessageStatus(sourceDomain: number, burnTxHash: string): Promise<CctpMessageStatusResult> {
  try {
    const url = `${IRIS_API_BASE}/v2/messages/${sourceDomain}?transactionHash=${burnTxHash}`;
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    if (!res.ok) return { status: "error" };
    const data = await res.json();
    const entries = Array.isArray(data?.messages) ? data.messages : Array.isArray(data) ? data : [];
    if (entries.length === 0) return { status: "iris_empty" };

    const entry = entries[0];
    const rawStatus = String(entry?.status ?? "").toLowerCase();
    if (rawStatus === "complete" && entry?.attestation) {
      return { status: "complete", message: entry.message, attestation: entry.attestation };
    }
    return { status: "pending" };
  } catch {
    return { status: "error" };
  }
}
