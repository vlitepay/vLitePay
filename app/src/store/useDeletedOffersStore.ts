"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import { syncStoreAcrossTabs } from "./cacheStorage";

/**
 * P2PEscrow has no cancel/close/deactivate/delete function for offers —
 * only `pauseOffer`/`resumeOffer` (paused flag) and `active`, which is set
 * true at creation and never flipped false by any contract function. So
 * "Delete" in MyShop can't remove the offer on-chain; the best available
 * on-chain action is the same `pauseOffer` Pause already uses, which is
 * enough to drop it from the public offer book (useOffers.ts already
 * filters on `active && !paused`). MyShop's own list (useMyOffers.ts) has
 * no such filter — it intentionally shows every offer a merchant has ever
 * posted, paused or not — so without this, a "deleted" offer would still
 * sit there forever looking exactly like a manually paused one.
 *
 * This is a small, local-only "hide from MyShop" flag per offer id, same
 * local-only pattern already used for profile data (see useProfileStore's
 * doc comment / the README's "Profile data is local-only" note) — it won't
 * follow the merchant to another device/browser, which is an acceptable
 * tradeoff for a testnet delete action that's really "pause + hide".
 */
interface DeletedOffersState {
  ids: Record<string, true>;
  markDeleted: (offerId: bigint) => void;
  isDeleted: (offerId: bigint) => boolean;
}

const STORAGE_KEY = "vlitepay-deleted-offers";

export const useDeletedOffersStore = create<DeletedOffersState>()(
  persist(
    (set, get) => ({
      ids: {},
      markDeleted: (offerId) => set((state) => ({ ids: { ...state.ids, [offerId.toString()]: true } })),
      isDeleted: (offerId) => !!get().ids[offerId.toString()],
    }),
    { name: STORAGE_KEY }
  )
);

syncStoreAcrossTabs(STORAGE_KEY, useDeletedOffersStore as any);
