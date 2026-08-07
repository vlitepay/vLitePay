"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Trade, MerchantApplication } from "@/lib/types/p2p";
import { bigintSafeStorage, syncStoreAcrossTabs } from "./cacheStorage";

interface AdminCacheState {
  disputedTrades: Trade[];
  resolvedTrades: Trade[];
  merchantApplications: MerchantApplication[];
  updatedAt: number;
  /** Only ever called with a fully successful read — see useDisputedTrades.ts / useMerchantApplications.ts's safe-fetch pattern. */
  setDisputedTrades: (trades: Trade[], resolvedTrades: Trade[]) => void;
  setMerchantApplications: (applications: MerchantApplication[]) => void;
}

const STORAGE_KEY = "vlitepay-admin-cache";

export const useAdminCacheStore = create<AdminCacheState>()(
  persist(
    (set) => ({
      disputedTrades: [],
      resolvedTrades: [],
      merchantApplications: [],
      updatedAt: 0,
      setDisputedTrades: (disputedTrades, resolvedTrades) =>
        set({ disputedTrades, resolvedTrades, updatedAt: Date.now() }),
      setMerchantApplications: (merchantApplications) =>
        set({ merchantApplications, updatedAt: Date.now() }),
    }),
    { name: STORAGE_KEY, storage: bigintSafeStorage }
  )
);

syncStoreAcrossTabs(STORAGE_KEY, useAdminCacheStore as any);
