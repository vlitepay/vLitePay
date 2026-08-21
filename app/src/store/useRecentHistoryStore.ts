"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

const MAX_ENTRIES = 8;

/**
 * Generic recent-input-history store, shared by a few different fields
 * (top-up phone, P2P amount per token, merchant/username search). Each
 * field picks its own `category` string; entries are further scoped by
 * wallet address so one wallet never sees another wallet's recent inputs
 * on a shared device — this mirrors useProfileStore's per-address keying
 * convention.
 *
 * Deliberately simple: no expiry, no server sync, just a persisted local
 * list of up to MAX_ENTRIES unique values per (category, wallet) pair,
 * newest first. This is purely a UX convenience (tappable suggestions
 * above an input) — never treated as authoritative data anywhere.
 */
interface RecentHistoryState {
  entries: Record<string, string[]>;
  /** Records `value` as the newest entry for (category, wallet), moving it
   * to the front if it already existed rather than duplicating it. No-op
   * for blank/whitespace-only values. */
  addRecent: (category: string, wallet: string | undefined, value: string) => void;
  /** Returns up to MAX_ENTRIES values for (category, wallet), newest first. */
  getRecent: (category: string, wallet: string | undefined) => string[];
  /** Clears history for one (category, wallet) pair — not wired into any
   * UI yet, exposed for a future "clear recent" affordance if wanted. */
  clearRecent: (category: string, wallet: string | undefined) => void;
}

function keyFor(category: string, wallet: string | undefined): string {
  return `${category}:${(wallet ?? "local").toLowerCase()}`;
}

export const useRecentHistoryStore = create<RecentHistoryState>()(
  persist(
    (set, get) => ({
      entries: {},

      addRecent: (category, wallet, value) => {
        const trimmed = value.trim();
        if (!trimmed) return;
        const key = keyFor(category, wallet);
        set((s) => {
          const existing = s.entries[key] ?? [];
          const deduped = [
            trimmed,
            ...existing.filter((v) => v.toLowerCase() !== trimmed.toLowerCase()),
          ].slice(0, MAX_ENTRIES);
          return { entries: { ...s.entries, [key]: deduped } };
        });
      },

      getRecent: (category, wallet) => {
        return get().entries[keyFor(category, wallet)] ?? [];
      },

      clearRecent: (category, wallet) => {
        set((s) => {
          const key = keyFor(category, wallet);
          if (!(key in s.entries)) return s;
          const next = { ...s.entries };
          delete next[key];
          return { entries: next };
        });
      },
    }),
    { name: "vlitepay-recent-history" }
  )
);
