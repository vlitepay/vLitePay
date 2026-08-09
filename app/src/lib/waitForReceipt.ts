import type { PublicClient } from "viem";

export class ReceiptTimeoutError extends Error {}

export class ReceiptRevertedError extends Error {
  receipt: unknown;
  constructor(message: string, receipt: unknown) {
    super(message);
    this.receipt = receipt;
  }
}

export interface WaitForReceiptOptions {
  /** Total time to keep retrying before giving up, in ms. */
  maxTimeoutMs?: number;
  /** Starting delay between polls, in ms. */
  initialDelayMs?: number;
  /** Multiplier applied to the delay after each attempt. */
  backoffFactor?: number;
  /** Ceiling on the per-poll delay, in ms, so backoff doesn't grow unbounded. */
  maxDelayMs?: number;
}

/**
 * Robust transaction-receipt poller used by every wallet write flow in the
 * app (Send, CCTP, P2P escrow actions, top-up, merchant actions, username
 * registration). Replaces bare, single-shot
 * `publicClient.waitForTransactionReceipt({ hash })` calls, which — with no
 * bounded retry/backoff of their own — could surface a single transient RPC
 * hiccup as a hard failure even though the transaction had already landed
 * on-chain. That's the "transaction succeeded on Arcscan, but the app shows
 * an RPC error" bug: Circle wallet flows take noticeably longer end-to-end
 * (PIN-confirm modal + Circle's own broadcast polling) than WalletConnect
 * handing back a hash almost immediately, giving a plain, non-retrying wait
 * far more exposure to Arc's public-RPC flakiness before it ever gets
 * called — even though it goes through our own /api/rpc proxy either way.
 *
 * Retries THROUGH not-yet-mined/transient errors using exponential backoff,
 * up to a bounded total timeout — a receipt not being found yet is expected
 * while a transaction is still pending, not a failure, and neither is one
 * dropped request to the RPC. Only exhausting the full timeout throws
 * ReceiptTimeoutError; that is the ONLY case that should ever surface as an
 * RPC error to the user. An actual on-chain revert is reported separately
 * and distinctly via ReceiptRevertedError — a real failure, not a
 * confirmation-check problem, and callers that care can tell the two apart.
 */
export async function waitForReceiptRobust(
  publicClient: PublicClient | undefined,
  hash: `0x${string}`,
  options: WaitForReceiptOptions = {}
) {
  const { maxTimeoutMs = 90_000, initialDelayMs = 1_500, backoffFactor = 1.5, maxDelayMs = 6_000 } = options;

  if (!publicClient) {
    throw new ReceiptTimeoutError("No RPC client available to confirm this transaction");
  }

  const deadline = Date.now() + maxTimeoutMs;
  let delay = initialDelayMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      const receipt = await publicClient.getTransactionReceipt({ hash });
      if (receipt.status === "reverted") {
        throw new ReceiptRevertedError(`Transaction ${hash} reverted on-chain`, receipt);
      }
      return receipt;
    } catch (err) {
      if (err instanceof ReceiptRevertedError) throw err;
      // Receipt not found yet (still pending) or a transient RPC error —
      // either way, not a failure, just "not confirmed yet, keep trying".
      lastError = err;
    }

    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * backoffFactor, maxDelayMs);
  }

  const detail = lastError instanceof Error ? lastError.message : "";
  throw new ReceiptTimeoutError(
    `Timed out confirming the transaction on-chain after ${Math.round(maxTimeoutMs / 1000)}s. ` +
      `It may still confirm shortly — check Arc Explorer for hash ${hash}.${detail ? ` (${detail})` : ""}`
  );
}
