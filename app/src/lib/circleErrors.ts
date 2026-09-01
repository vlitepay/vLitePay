/**
 * Shared between lib/circleConnector.ts (decides whether to refresh +
 * retry a Circle write) and every hook that displays the result of one
 * (Send, top-up, P2P, ...). Kept dependency-free (no imports from
 * circleSession/circleTokenRefresh/circleConnector) so it can be imported
 * from either side without any circular-import risk.
 */

/**
 * Thrown by lib/circleConnector.ts once a Circle write has already been
 * retried once after a session refresh and still failed for a
 * session-related reason — or the refresh itself failed. This is the one
 * error type meant to definitively mean "sign in again": callers should
 * check for it structurally (`instanceof`) rather than re-guessing from
 * text, since by the time it's thrown, this file's own retry-once logic
 * has already ruled out a transient problem.
 */
export class CircleSessionExpiredError extends Error {
  constructor() {
    super("Session expired. Sign in again.");
    this.name = "CircleSessionExpiredError";
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const anyErr = err as Record<string, unknown>;
    if (typeof anyErr.shortMessage === "string") return anyErr.shortMessage;
    if (typeof anyErr.message === "string") return anyErr.message;
  }
  return String(err ?? "");
}

/**
 * Wagmi/viem's write actions (writeContract, sendTransaction,
 * signTypedData) commonly re-throw a wrapping BaseError with our
 * connector's real rejection attached only as `.cause` — sometimes several
 * layers deep — rather than surfacing it as the top-level thrown value.
 * Walking the chain (bounded depth, just in case something cycles) is the
 * only reliable way to find what our own connector actually rejected with.
 */
function collectCauseChain(err: unknown, depth = 0): unknown[] {
  if (err === null || err === undefined || depth > 6) return [];
  const cause = (err as any)?.cause;
  return [err, ...collectCauseChain(cause, depth + 1)];
}

/**
 * Circle's own SDK/API failures for an expired/invalid session don't
 * always carry a code we can rely on by the time they've passed through
 * wagmi/viem — 155104 sometimes survives in the message text itself,
 * other times it surfaces as "unauthorized", or as viem's own generic
 * "unknown RPC error" wrapper text once our real message has been
 * discarded. Matched case-insensitively, at any depth of `.cause`.
 */
export function looksLikeStaleCircleSessionError(err: unknown): boolean {
  return collectCauseChain(err).some((e) => {
    if (e instanceof CircleSessionExpiredError) return true;
    const message = errorMessage(e).toLowerCase();
    return (
      message.includes("155104") ||
      message.includes("unauthorized") ||
      message.includes("invalid token") ||
      message.includes("invalid grant") ||
      message.includes("token expired") ||
      message.includes("session expired") ||
      message.includes("unknown rpc error")
    );
  });
}

function looksLikeGenericRpcNoise(err: unknown): boolean {
  return collectCauseChain(err).some((e) => {
    const message = errorMessage(e).toLowerCase();
    return (
      message.includes("unknown rpc error") ||
      message.includes("internal json-rpc error") ||
      message.includes("failed to fetch") ||
      message.includes("networkerror")
    );
  });
}

/**
 * Single place Send/top-up/P2P (and anything else writing through the
 * Circle wallet) turn a caught error into UI copy. Never shows viem's raw
 * "An unknown RPC error occurred" text — that's either a stale Circle
 * session (should already have been caught and retried inside
 * circleConnector.ts; this is the backstop if it somehow still surfaces)
 * or a genuine transient network/RPC hiccup, and either way the person
 * needs to know what to do next, not viem's internal wording. Any other
 * error (a real contract revert, the user cancelling the PIN prompt, "not
 * enough balance", etc.) keeps its own specific message unchanged.
 */
export function describeCircleWriteError(err: unknown, fallback: string): string {
  if (looksLikeStaleCircleSessionError(err)) {
    return "Session expired. Sign in again.";
  }
  if (looksLikeGenericRpcNoise(err)) {
    return "Network busy. Try again.";
  }
  return errorMessage(err) || fallback;
}
