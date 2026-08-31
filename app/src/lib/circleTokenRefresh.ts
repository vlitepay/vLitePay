"use client";

import { getCircleSession, setCircleSession } from "./circleSession";

/**
 * Circle userTokens go stale well before "log out and back in" should be
 * the only fix. Refresh proactively — both on a periodic timer while the
 * app is open (see components/auth/CircleSessionGuard.tsx) and right
 * before a signing/transaction challenge (see lib/circleConnector.ts) —
 * rather than waiting for a challenge to fail with Circle's expired-token
 * error (155104).
 *
 * 15 minutes is a conservative guess, not a value from Circle's docs — the
 * point of refreshing this often is that doing it too eagerly is harmless
 * (a fresh token is always valid), while doing it too rarely risks exactly
 * the "stale after hours of inactivity" symptom this exists to fix.
 */
const CIRCLE_TOKEN_STALE_MS = 15 * 60 * 1000;

export function isCircleSessionStale(): boolean {
  const session = getCircleSession();
  if (!session) return false;
  return Date.now() - session.issuedAt > CIRCLE_TOKEN_STALE_MS;
}

/**
 * Unconditionally refreshes the current Circle session via
 * POST /api/circle/token/refresh, using the persisted refreshToken +
 * deviceId (see lib/circleSession.ts). On success, persists the NEW
 * userToken/encryptionKey/refreshToken triple and re-authenticates the
 * Circle SDK with the new pair (both handled by setCircleSession).
 *
 * On any failure — network error, Circle rejecting the refresh (e.g. the
 * refresh token itself expired/was revoked), or an unexpected response —
 * the session is cleared entirely rather than left in a half-valid state.
 * Callers must treat a `false` return as "the user needs to sign in
 * again", not retry silently.
 */
export async function refreshCircleSession(): Promise<boolean> {
  const session = getCircleSession();
  if (!session) return false;

  try {
    const res = await fetch("/api/circle/token/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userToken: session.userToken,
        refreshToken: session.refreshToken,
        deviceId: session.deviceId,
      }),
    });

    if (!res.ok) {
      setCircleSession(null);
      return false;
    }

    const { userToken, encryptionKey, refreshToken } = await res.json();
    if (!userToken || !encryptionKey || !refreshToken) {
      setCircleSession(null);
      return false;
    }

    setCircleSession({
      ...session,
      userToken,
      encryptionKey,
      refreshToken,
      issuedAt: Date.now(),
    });
    return true;
  } catch {
    setCircleSession(null);
    return false;
  }
}

/**
 * Refreshes only if the persisted session looks stale. Shared by both the
 * app-open timer and the pre-challenge guard so neither refreshes more
 * aggressively than necessary. Returns true if the session is fine as-is
 * or was successfully refreshed; false if there's no session, or a needed
 * refresh failed (session has been cleared in that case).
 */
export async function refreshCircleSessionIfStale(): Promise<boolean> {
  if (!getCircleSession()) return false;
  if (!isCircleSessionStale()) return true;
  return refreshCircleSession();
}
