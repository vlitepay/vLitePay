"use client";

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useVLiteStore } from "@/store/useVLiteStore";

export function AuthSync() {
  const { address, isConnected, connector } = useAccount();
  const setAuth = useVLiteStore((s) => s.setAuth);
  const clearAuth = useVLiteStore((s) => s.clearAuth);
  const authMethod = useVLiteStore((s) => s.authMethod);

  useEffect(() => {
    if (isConnected && address) {
      setAuth(connector?.id === "circle-email" ? "circle-email" : "wallet", address);
    } else if (authMethod === "wallet") {
      // Only clear auth if a wagmi wallet connector was the active session.
      // A Circle email session can also report isConnected === false right
      // after a page reload (the in-memory session isn't persisted — see
      // circleSession.ts) without that meaning the user logged out; we
      // don't want to wipe useVLiteStore's record of it in that case.
      clearAuth();
    }
  }, [isConnected, address, connector]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
