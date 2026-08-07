"use client";

import { ReactNode } from "react";
import { useAccount } from "wagmi";
import { useVLiteStore } from "@/store/useVLiteStore";
import { ConnectScreen } from "./ConnectScreen";
import { SplashScreen } from "@/components/SplashScreen";

/**
 * Gates the entire app behind a connect/login step. Authenticated means
 * either a live wagmi wallet connection, or a completed Circle email
 * session (tracked in useVLiteStore). Circle logins are now wired into
 * wagmi as a real connector (see lib/circleConnector.ts), so a live Circle
 * session shows up through `isConnected` just like any other wallet and
 * every on-chain hook in the app (useTokenBalances, useTrade, escrow, etc.)
 * works normally.
 *
 * The Circle session now persists to localStorage (see circleSession.ts)
 * and is restored synchronously as soon as the app boots — before wagmi's
 * built-in reconnect-on-mount runs — so `circleConnector.isAuthorized()`
 * reports true and wagmi reconnects the Circle wallet on page load exactly
 * the way it reconnects an injected/WalletConnect wallet. In that flow
 * `status` passes through `"reconnecting"` just like a normal wallet, and
 * `isConnected`/`address` end up populated the same way, so on-chain hooks
 * work immediately after a refresh too — not just within the original tab.
 *
 * The `authMethod === "circle-email"` fallback below now only matters for
 * the brief window before that automatic reconnect resolves, or if the
 * persisted session was cleared out from under the app (e.g. localStorage
 * wiped by the browser or user) while useVLiteStore's own record hasn't
 * caught up yet. It keeps the app shell visible in that moment rather than
 * bouncing to ConnectScreen; AuthSync reconciles the two shortly after.
 *
 * While wagmi is silently reconnecting a previously-linked wallet on page
 * load (`status === "reconnecting"`), we show the splash screen instead of
 * flashing the connect screen and then immediately swapping to the app.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const { isConnected, status } = useAccount();
  const authMethod = useVLiteStore((s) => s.authMethod);
  const storedAddress = useVLiteStore((s) => s.address);

  const authenticated = isConnected || (authMethod === "circle-email" && !!storedAddress);
  const reconnecting = status === "reconnecting" && !authenticated;

  if (reconnecting) {
    return <SplashScreen />;
  }

  if (!authenticated) {
    return <ConnectScreen />;
  }

  return <>{children}</>;
}
