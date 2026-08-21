"use client";

import { useAccount } from "wagmi";
import { Search, X } from "lucide-react";
import { RecentSuggestions } from "@/components/shared/RecentSuggestions";
import { useRecentHistoryStore } from "@/store/useRecentHistoryStore";

export function SearchMerchantInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { address } = useAccount();
  const addRecentSearch = useRecentHistoryStore((s) => s.addRecent);
  const recentSearches = useRecentHistoryStore((s) => s.getRecent("merchant-search", address));

  return (
    <div className="relative">
      <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          if (value.trim().length >= 2) addRecentSearch("merchant-search", address, value);
        }}
        placeholder="Search username, merchant, or amount..."
        className="w-full rounded-2xl pl-10 pr-9 py-3 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-light dark:hover:text-ink-dark"
          aria-label="Clear search"
        >
          <X size={14} />
        </button>
      )}
      {/* Shown only while empty — once the user is actively typing, the live
          filter results below take over and static suggestion chips would
          just be visual clutter alongside them. */}
      {!value && <RecentSuggestions values={recentSearches} onSelect={onChange} />}
    </div>
  );
}
