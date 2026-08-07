/**
 * Prevents the same on-chain payment from being redeemed for airtime more
 * than once (e.g. a retried request, or someone replaying an old txHash),
 * while still letting a legitimate retry go through if Reloadly itself
 * fails after the payment was verified.
 *
 * Three states per txHash: free -> claimed -> redeemed.
 *   - claim(): reserves the hash right after on-chain verification passes,
 *     before calling Reloadly. A concurrent/retried request sees it already
 *     claimed and is rejected — this is what actually prevents double-spend.
 *   - redeem(): called once Reloadly's call succeeds; permanent.
 *   - release(): called if Reloadly's call fails, freeing the hash again so
 *     the same verified payment can be retried instead of being stuck.
 *
 * This is process-memory only — it resets on redeploy/restart and doesn't
 * work across multiple backend instances. That's fine for a single-instance
 * deployment; for anything else, swap this for a row in whatever database
 * you introduce (a unique constraint + status column on txHash is enough),
 * or a shared store like Redis. Flagged here rather than silently shipping
 * a gap.
 */
type TxHashState = "claimed" | "redeemed";

const txHashes = new Map<string, TxHashState>();

export function isTxHashUsed(txHash: string): boolean {
  return txHashes.has(txHash.toLowerCase());
}

/** Reserves a txHash. Returns false if it's already claimed or redeemed. */
export function claimTxHash(txHash: string): boolean {
  const key = txHash.toLowerCase();
  if (txHashes.has(key)) return false;
  txHashes.set(key, "claimed");
  return true;
}

export function redeemTxHash(txHash: string): void {
  txHashes.set(txHash.toLowerCase(), "redeemed");
}

export function releaseTxHash(txHash: string): void {
  const key = txHash.toLowerCase();
  if (txHashes.get(key) === "claimed") {
    txHashes.delete(key);
  }
}
