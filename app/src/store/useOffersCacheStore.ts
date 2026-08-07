"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Offer } from "@/lib/types/p2p";
import { bigintSafeStorage, syncStoreAcrossTabs } from "./cacheStorage";

interface OffersEntry {
  offers: Offer[];
  updatedAt: number;
}

interface OffersCacheState {
  byKey: Record<string, OffersEntry>;
  /** Only ever called with a fully successful read — see useOffers.ts's safe-fetch pattern. */
  setOffers: (key: string, offers: Offer[]) => void;
  getOffers: (key: string) => OffersEntry | null;
}

const STORAGE_KEY = "vlitepay-offers-cache";

export const useOffersCacheStore = create<OffersCacheState>()(
  persist(
    (set, get) => ({
      byKey: {},
      setOffers: (key, offers) =>
        set((state) => ({
          byKey: { ...state.byKey, [key]: { offers, updatedAt: Date.now() } },
        })),
      getOffers: (key) => get().byKey[key] ?? null,
    }),
    { name: STORAGE_KEY, storage: bigintSafeStorage }
  )
);

syncStoreAcrossTabs(STORAGE_KEY, useOffersCacheStore as any);
