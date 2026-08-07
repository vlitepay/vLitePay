"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Trade } from "@/lib/types/p2p";
import { bigintSafeStorage, syncStoreAcrossTabs } from "./cacheStorage";

interface TradeHistoryEntry {
  trades: Trade[];
  updatedAt: number;
}

interface TradeHistoryCacheState {
  byAddress: Record<string, TradeHistoryEntry>;
  /** Only ever called with a fully successful read — see useTradeHistory.ts's safe-fetch pattern. */
  setTrades: (address: string, trades: Trade[]) => void;
  getTrades: (address: string | undefined) => TradeHistoryEntry | null;
}

const STORAGE_KEY = "vlitepay-trade-history-cache";

export const useTradeHistoryCacheStore = create<TradeHistoryCacheState>()(
  persist(
    (set, get) => ({
      byAddress: {},
      setTrades: (address, trades) =>
        set((state) => ({
          byAddress: { ...state.byAddress, [address.toLowerCase()]: { trades, updatedAt: Date.now() } },
        })),
      getTrades: (address) => {
        if (!address) return null;
        return get().byAddress[address.toLowerCase()] ?? null;
      },
    }),
    { name: STORAGE_KEY, storage: bigintSafeStorage }
  )
);

syncStoreAcrossTabs(STORAGE_KEY, useTradeHistoryCacheStore as any);
