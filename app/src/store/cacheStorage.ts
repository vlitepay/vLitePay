import { createJSONStorage } from "zustand/middleware";
import type { StoreApi } from "zustand";

/**
 * Zustand's default JSON storage calls plain JSON.stringify/parse, which
 * throws on bigint (Offer/Trade fields like `rate`, `minAmount`, `volume`,
 * etc. are all bigint). This wraps bigints as `{ __bigint__: "123" }` on
 * write and unwraps them on read, so the on-chain data these caches store
 * round-trips through localStorage correctly.
 */
function replacer(_key: string, value: unknown) {
  return typeof value === "bigint" ? { __bigint__: value.toString() } : value;
}

function reviver(_key: string, value: unknown) {
  if (value && typeof value === "object" && "__bigint__" in (value as Record<string, unknown>)) {
    return BigInt((value as { __bigint__: string }).__bigint__);
  }
  return value;
}

export const bigintSafeStorage = createJSONStorage(() => localStorage, { replacer, reviver });

/**
 * Zustand's `persist` middleware writes to localStorage but doesn't listen
 * for changes made by *other* tabs/windows on the same origin — each tab's
 * in-memory store only reflects what it last wrote itself. That's what
 * makes "one tab shows correct data, another shows 0" possible even with a
 * safe-fetch pattern: a second tab that has never successfully fetched yet
 * has nothing in memory, even though a sibling tab already cached good data
 * to the SAME localStorage key moments ago.
 *
 * This listens for the browser's `storage` event (fired in every other tab
 * whenever one tab writes to localStorage) and re-hydrates this store from
 * whatever is currently on disk, so a tab that's still loading — or one
 * that just hit a transient RPC error — immediately picks up good data a
 * sibling tab already fetched, instead of showing its own empty state.
 *
 * Call this once per cache store, right after creating it.
 */
export function syncStoreAcrossTabs(storageKey: string, store: StoreApi<unknown> & { persist: { rehydrate: () => void } }) {
  if (typeof window === "undefined") return;
  window.addEventListener("storage", (event) => {
    if (event.key === storageKey) {
      store.persist.rehydrate();
    }
  });
}
