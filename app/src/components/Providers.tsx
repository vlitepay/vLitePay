"use client";

import { ReactNode, useEffect, useState } from "react";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { wagmiConfig } from "@/lib/wagmi-config";
import { useVLiteStore } from "@/store/useVLiteStore";

// NOTE: this file doesn't import any wallet connectors directly — it just
// wraps the app in <WagmiProvider config={wagmiConfig} />, where `wagmiConfig`
// comes from src/lib/wagmi-config.ts. That's the file that actually declares
// which connectors are registered (injected + WalletConnect only) and where
// the full explanation of the Coinbase/Base/x402 dependency bloat — and how
// it's avoided — lives. See the doc comment at the top of wagmi-config.ts.

function ThemeSync({ children }: { children: ReactNode }) {
  const theme = useVLiteStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [theme]);

  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
  }));

  return (
    <WagmiProvider config={wagmiConfig} reconnectOnMount>
      <QueryClientProvider client={queryClient}>
        <ThemeSync>{children}</ThemeSync>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
