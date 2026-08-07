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
 * Known limitation: Circle's userToken has its own server-side expiry.
 * Restoring it here doesn't refresh an expired token — if it has expired,
 * the next signing attempt will fail and the user needs to log in again.
 * Token refresh isn't implemented (out of scope here, same as the rest of
 * the backend Circle wiring, which is still stubbed pending CIRCLE_API_KEY).
 */
export interface CircleSession {
  address: `0x${string}`;
  walletId: string;
  userToken: string;
  encryptionKey: string;
}

const STORAGE_KEY = "vlitepay-circle-session";

function isCircleSession(value: unknown): value is CircleSession {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as any).address === "string" &&
    typeof (value as any).walletId === "string" &&
    typeof (value as any).userToken === "string" &&
    typeof (value as any).encryptionKey === "string"
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
