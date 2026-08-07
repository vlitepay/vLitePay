"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TokenSymbol } from "@/lib/constants";
import { bigintSafeStorage, syncStoreAcrossTabs } from "./cacheStorage";

interface BalanceEntry {
  balances: Record<TokenSymbol, number>;
  updatedAt: number;
}

interface BalanceCacheState {
  byAddress: Record<string, BalanceEntry>;
  /** Only ever called with a fully successful read — see useTokenBalances.ts's safe-fetch pattern. */
  setBalances: (address: string, balances: Record<TokenSymbol, number>) => void;
  getBalances: (address: string | undefined) => BalanceEntry | null;
}

const STORAGE_KEY = "vlitepay-balance-cache";

export const useBalanceCacheStore = create<BalanceCacheState>()(
  persist(
    (set, get) => ({
      byAddress: {},
      setBalances: (address, balances) =>
        set((state) => ({
          byAddress: {
            ...state.byAddress,
            [address.toLowerCase()]: { balances, updatedAt: Date.now() },
          },
        })),
      getBalances: (address) => {
        if (!address) return null;
        return get().byAddress[address.toLowerCase()] ?? null;
      },
    }),
    { name: STORAGE_KEY, storage: bigintSafeStorage }
  )
);

syncStoreAcrossTabs(STORAGE_KEY, useBalanceCacheStore as any);
