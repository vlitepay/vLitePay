"use client";

import { getCircleSdk } from "./circleSdk";

/**
 * In-memory + persisted bridge between Circle's login flow (lib/circle.ts)
 * and the custom wagmi connector (lib/circleConnector.ts). Kept in its own
 * module (rather than living in either file) so neither has to import the
 * other.
 *
 * Persistence: the session is mirrored to localStorage so it survives a
 * page reload. On module load (i.e. as soon as the app boots on the
 * client), we synchronously read it back and re-hydrate both the in-memory
 * `currentSession` and the Circle SDK's own authentication state — this has
 * to happen before wagmi's automatic reconnect-on-mount runs, which is why
 * it's done at module-eval time rather than inside a React effect.
 * `circleConnector.isAuthorized()` then reports true immediately, so
 * wagmi's built-in reconnect flow logs the Circle wallet back in exactly
 * the same way it reconnects an injected/WalletConnect wallet.
 *
 * Known limitation (now fixed — see lib/circleTokenRefresh.ts): Circle's
 * userToken has its own server-side expiry. This module now also persists
 * `refreshToken`/`deviceId`/`issuedAt` alongside the token pair so a stale
 * session can be refreshed (POST /api/circle/token/refresh) instead of
 * forcing a full re-login.
 */
export interface CircleSession {
  address: `0x${string}`;
  walletId: string;
  userToken: string;
  encryptionKey: string;
  /** Circle's refresh token — required to call /api/circle/token/refresh. */
  refreshToken: string;
  /** Same deviceId used at login (sdk.getDeviceId()) — Circle's refresh endpoint requires it too. */
  deviceId: string;
  /** Date.now() when this userToken/refreshToken pair was (re)issued — drives staleness checks in circleTokenRefresh.ts. */
  issuedAt: number;
}

const STORAGE_KEY = "vlitepay-circle-session";

function isCircleSession(value: unknown): value is CircleSession {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as any).address === "string" &&
    typeof (value as any).walletId === "string" &&
    typeof (value as any).userToken === "string" &&
    typeof (value as any).encryptionKey === "string" &&
    typeof (value as any).refreshToken === "string" &&
    typeof (value as any).deviceId === "string" &&
    typeof (value as any).issuedAt === "number"
  );
}

function readPersistedSession(): CircleSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isCircleSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writePersistedSession(session: CircleSession | null) {
  if (typeof window === "undefined") return;
  try {
    if (session) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // localStorage unavailable (private browsing, storage full/blocked,
    // etc.) — the in-memory session below still works for this tab.
  }
}

let currentSession: CircleSession | null = readPersistedSession();

// Re-hydrate the Circle SDK's own auth state immediately so a restored
// session can actually execute a signing challenge later, not just report
// an address.
if (currentSession) {
  getCircleSdk().setAuthentication({
    userToken: currentSession.userToken,
    encryptionKey: currentSession.encryptionKey,
  });
}

export function setCircleSession(session: CircleSession | null) {
  currentSession = session;
  writePersistedSession(session);

  if (session) {
    getCircleSdk().setAuthentication({ userToken: session.userToken, encryptionKey: session.encryptionKey });
  }
}

export function getCircleSession(): CircleSession | null {
  return currentSession;
}
