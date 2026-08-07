"use client";

import { Search, X } from "lucide-react";

export function FaqSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative">
      <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={'Search FAQs — e.g. "dispute", "timer", "fee"…'}
        className="w-full rounded-2xl pl-10 pr-9 py-3 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
      />
      {value && (
        <button onClick={() => onChange("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink-light dark:hover:text-ink-dark" aria-label="Clear search">
          <X size={14} />
        </button>
      )}
    </div>
  );
}
