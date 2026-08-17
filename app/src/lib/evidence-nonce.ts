import "server-only";

/**
 * SERVER-ONLY nonce helper for evidence uploads. Mirrors
 * lib/profile-nonce.ts exactly (same shape, same TTL, same globalThis/HMR
 * pattern) but is a DELIBERATELY SEPARATE store, not a shared one — if
 * evidence uploads and profile saves shared one wallet-keyed nonce map,
 * starting one flow would silently invalidate the other's in-flight nonce
 * for the same wallet (createProfileNonce overwrites any previous entry
 * for that key). Keeping them separate avoids that cross-feature bug.
 *
 * Generates the short-lived, single-use message a wallet must sign
 * (personal_sign) to prove ownership before an evidence upload is trusted.
 * Without a fresh nonce per request, a captured signature could be replayed
 * to authorize a later, different upload.
 *
 * ⚠️ TEMPORARY STORAGE — IN-MEMORY ONLY. Same production caveats as
 * lib/profile-nonce.ts: does not survive a restart, not shared across
 * server instances. Fine for single-instance/dev; replace with Redis or a
 * Supabase table with an `expires_at` column before relying on this in a
 * horizontally-scaled production deployment.
 *
 * DEV-ONLY NOTE: stashed on `globalThis` so it survives Next.js dev's HMR
 * module re-evaluation — same reasoning as lib/profile-nonce.ts.
 */

interface StoredNonce {
  message: string;
  expiresAt: number;
}

const NONCE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const globalForNonceStore = globalThis as unknown as {
  __vlitepayEvidenceNonceStore?: Map<string, StoredNonce>;
};

const nonceStore: Map<string, StoredNonce> =
  globalForNonceStore.__vlitepayEvidenceNonceStore ?? new Map<string, StoredNonce>();

globalForNonceStore.__vlitepayEvidenceNonceStore = nonceStore;

/**
 * Creates a fresh nonce/message for `walletAddress` to sign, overwriting
 * any previous unconsumed evidence-upload nonce for that wallet.
 *
 * Deliberately single-line (no embedded `\n`): unlike lib/profile-nonce.ts
 * (transported as JSON, where newlines round-trip byte-for-byte safely),
 * this message is transported as a multipart/form-data field alongside the
 * uploaded file — multipart parsers can normalize line endings when
 * round-tripping text parts. If that happened, the server would receive a
 * message differing from what the wallet actually signed, causing a
 * confusing 401 (bad nonce or bad signature) right after the signature
 * prompt, with no further explanation. A single-line message removes the
 * risk outright rather than trying to compensate for it after the fact —
 * normalizing on the server can't fix this anyway, since the signature was
 * computed over the client's original, possibly-different string.
 */
export function createEvidenceNonce(walletAddress: string): string {
  const key = walletAddress.toLowerCase();
  const nonce = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + NONCE_TTL_MS).toISOString();
  const message = `vLitePay evidence upload for wallet ${key} - nonce ${nonce} - expires ${expiresAt}`;

  nonceStore.set(key, { message, expiresAt: Date.now() + NONCE_TTL_MS });

  return message;
}

/**
 * Validates that `message` is the current, unexpired evidence-upload nonce
 * for `walletAddress`, then invalidates it (single-use) regardless of
 * outcome — same semantics as consumeProfileNonce.
 */
export function consumeEvidenceNonce(walletAddress: string, nonce: string): boolean {
  const key = walletAddress.toLowerCase();
  const stored = nonceStore.get(key);

  nonceStore.delete(key);

  if (!stored) return false;
  if (Date.now() > stored.expiresAt) return false;

  return stored.message === nonce;
}
