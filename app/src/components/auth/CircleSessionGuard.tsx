"use client";

import { useEffect } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { useVLiteStore } from "@/store/useVLiteStore";
import { getCircleSession } from "@/lib/circleSession";
import { refreshCircleSessionIfStale } from "@/lib/circleTokenRefresh";
import { notify } from "@/lib/notify";

/** How often to check whether the Circle session needs refreshing while the app stays open. Independent of CIRCLE_TOKEN_STALE_MS in circleTokenRefresh.ts — this just needs to be frequent enough that the staleness window is never missed by more than a few minutes. */
const CIRCLE_REFRESH_CHECK_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Mounted once at the app root (see components/Providers.tsx). For as long
 * as a Circle (email or Google) User-Controlled Wallet session is active,
 * periodically refreshes it before it goes stale — fixing the "session
 * goes stale after hours of inactivity, transaction challenges fail until
 * logout/login" issue for both login methods (they share the same
 * userToken/refreshToken mechanics, so one guard covers both).
 *
 * If a refresh attempt itself fails (e.g. the refresh token has expired or
 * was revoked), the session is torn down for real — Circle session
 * cleared (already done inside refreshCircleSessionIfStale), wagmi
 * disconnected, useVLiteStore's auth record cleared, and the user is
 * notified — rather than leaving a half-authenticated app open with no
 * explanation.
 */
export function CircleSessionGuard() {
  const { connector } = useAccount();
  const { disconnect } = useDisconnect();
  const clearAuth = useVLiteStore((s) => s.clearAuth);

  useEffect(() => {
    if (connector?.id !== "circle-email") return;

    let cancelled = false;

    async function tick() {
      if (!getCircleSession()) return;
      const ok = await refreshCircleSessionIfStale();
      if (!ok && !cancelled) {
        clearAuth();
        disconnect();
        notify({
          category: "system",
          title: "Signed out",
          message: "Your session expired for security. Please sign in again.",
        });
      }
    }

    tick();
    const interval = setInterval(tick, CIRCLE_REFRESH_CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [connector, disconnect, clearAuth]);

  return null;
}
