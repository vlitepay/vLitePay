import "server-only";

/**
 * SERVER-ONLY nonce helper. NOT called by any route yet — this exists so
 * the nonce/message piece of the future signature-verification flow is
 * written ahead of wiring it into app/api/profile/route.ts's POST handler
 * alongside verify-wallet-signature.ts and supabase-profile-write.ts.
 *
 * Generates the short-lived, single-use message a wallet must sign
 * (personal_sign) to prove ownership before a profile write is trusted.
 * Without a fresh nonce per request, a captured signature could be replayed
 * to authorize a later, different write — the nonce is what makes each
 * signature valid for exactly one attempt.
 *
 * ⚠️ TEMPORARY STORAGE — IN-MEMORY ONLY. This uses a plain in-process
 * `Map`, which means:
 *   - Nonces do NOT survive a server restart/redeploy.
 *   - Nonces are NOT shared across multiple server instances (breaks under
 *     horizontal scaling / serverless — Vercel, load-balanced deployments,
 *     etc., since each instance has its own Map).
 * This is fine for local/single-instance development only. Before this is
 * relied on in production, replace the Map below with Redis (e.g. Upstash,
 * TTL-native and works across instances) or a Supabase table with an
 * `expires_at` column and a cleanup query — either fully replaces this
 * file's internals without changing its two exported function signatures.
 *
 * DEV-ONLY NOTE: the Map is stashed on `globalThis` rather than being a
 * plain module-level `const`. Next.js's dev server re-executes route/lib
 * modules on hot reload, which would otherwise silently create a fresh,
 * empty Map on every file save — wiping every nonce mid-testing and
 * causing exactly the spurious 401s this change is meant to fix. Storing
 * it on `globalThis` (same pattern commonly used for dev-mode Prisma
 * client singletons) makes it survive HMR re-evaluation within the same
 * server process. This has no effect on the production caveats above —
 * it does not make the store multi-instance-safe or restart-safe.
 */

interface StoredNonce {
  message: string;
  expiresAt: number;
}

const NONCE_TTL_MS = 20 * 60 * 1000; // 20 minutes — generous for manual testing

const globalForNonceStore = globalThis as unknown as {
  __vlitepayProfileNonceStore?: Map<string, StoredNonce>;
};

const nonceStore: Map<string, StoredNonce> =
  globalForNonceStore.__vlitepayProfileNonceStore ?? new Map<string, StoredNonce>();

globalForNonceStore.__vlitepayProfileNonceStore = nonceStore;

/**
 * Creates a fresh nonce/message for `walletAddress` to sign, overwriting
 * any previous unconsumed nonce for that wallet (only the most recent
 * challenge per wallet is valid at a time).
 *
 * Returns the exact message string the client should pass to
 * personal_sign — include the wallet address and a human-readable purpose
 * so a signing wallet's confirmation UI shows something meaningful, not an
 * opaque random string.
 */
export function createProfileNonce(walletAddress: string): string {
  const key = walletAddress.toLowerCase();
  const nonce = crypto.randomUUID();
  const message = `vLitePay profile update\nWallet: ${key}\nNonce: ${nonce}\nExpires: ${new Date(
    Date.now() + NONCE_TTL_MS
  ).toISOString()}`;

  nonceStore.set(key, { message, expiresAt: Date.now() + NONCE_TTL_MS });

  return message;
}

/**
 * Validates that `message` is the current, unexpired nonce for
 * `walletAddress`, then invalidates it (single-use) regardless of outcome
 * — a nonce is consumed on its first verification attempt whether it
 * succeeds or fails, so a signature can never be checked twice.
 *
 * Note the param is named `nonce` to match the requested signature, but
 * what's actually compared is the full message string returned by
 * createProfileNonce — the caller should pass back exactly what it signed.
 */
export function consumeProfileNonce(walletAddress: string, nonce: string): boolean {
  const key = walletAddress.toLowerCase();
  const stored = nonceStore.get(key);

  // Always invalidate on any attempt — single-use regardless of the result.
  nonceStore.delete(key);

  if (!stored) {
    return false;
  }

  if (Date.now() > stored.expiresAt) {
    return false;
  }

  return stored.message === nonce;
}
