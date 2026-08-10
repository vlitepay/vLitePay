import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TokenSymbol } from "@/lib/constants";

export type AuthMethod = "wallet" | "circle-email" | "circle-social" | null;

interface PortfolioPoint {
  timestamp: number;
  valueUsd: number;
}

interface VLiteState {
  // --- Auth / session ---
  authMethod: AuthMethod;
  address: `0x${string}` | null;
  username: string | null;
  setAuth: (authMethod: AuthMethod, address: `0x${string}` | null, username?: string | null) => void;
  clearAuth: () => void;

  // --- Theme ---
  theme: "light" | "dark";
  toggleTheme: () => void;
  setTheme: (theme: "light" | "dark") => void;

  // --- Balances (populated from on-chain reads; cached here for instant paint) ---
  balances: Record<TokenSymbol, number>;
  setBalance: (token: TokenSymbol, amount: number) => void;

  // --- Portfolio history for chart (7d / 30d) ---
  portfolioHistory: { "7d": PortfolioPoint[]; "30d": PortfolioPoint[] };
  setPortfolioHistory: (range: "7d" | "30d", points: PortfolioPoint[]) => void;

  // --- Active P2P trade panel (persists across navigation) ---
  activeTradeId: number | null;
  setActiveTradeId: (id: number | null) => void;

  // --- First-action onboarding prompt (hidden permanently after first success) ---
  hasCompletedFirstAction: boolean;
  markFirstActionComplete: () => void;

  // --- Home screen "hide balances" privacy toggle ---
  portfolioHidden: boolean;
  togglePortfolioHidden: () => void;
}

export const useVLiteStore = create<VLiteState>()(
  persist(
    (set, get) => ({
      authMethod: null,
      address: null,
      username: null,
      setAuth: (authMethod, address, username = null) => set({ authMethod, address, username }),
      clearAuth: () => set({ authMethod: null, address: null, username: null }),

      theme: "dark",
      toggleTheme: () => set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      setTheme: (theme) => set({ theme }),

      balances: { USDC: 0, EURC: 0, cirBTC: 0 },
      setBalance: (token, amount) =>
        set((s) => ({ balances: { ...s.balances, [token]: amount } })),

      portfolioHistory: { "7d": [], "30d": [] },
      setPortfolioHistory: (range, points) =>
        set((s) => ({ portfolioHistory: { ...s.portfolioHistory, [range]: points } })),

      activeTradeId: null,
      setActiveTradeId: (id) => {
        if (get().activeTradeId === id) return; // no-op if unchanged — avoids redundant re-renders
        set({ activeTradeId: id });
      },

      hasCompletedFirstAction: false,
      markFirstActionComplete: () => set({ hasCompletedFirstAction: true }),

      portfolioHidden: false,
      togglePortfolioHidden: () => set((s) => ({ portfolioHidden: !s.portfolioHidden })),
    }),
    {
      name: "vlitepay-store",
      partialize: (s) => ({
        authMethod: s.authMethod,
        address: s.address,
        username: s.username,
        theme: s.theme,
        activeTradeId: s.activeTradeId,
        hasCompletedFirstAction: s.hasCompletedFirstAction,
        portfolioHistory: s.portfolioHistory,
        portfolioHidden: s.portfolioHidden,
      }),
    }
  )
);
