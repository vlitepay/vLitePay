"use client";

import { History } from "lucide-react";

/**
 * Row of tappable "recent value" chips shown above/near an input. Tapping
 * a chip fills the field via `onSelect`. Renders nothing if `values` is
 * empty, so it's always safe to drop in unconditionally.
 */
export function RecentSuggestions({
  values,
  onSelect,
}: {
  values: string[];
  onSelect: (value: string) => void;
}) {
  if (values.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 mt-1.5 overflow-x-auto">
      <History size={12} className="text-ink-muted shrink-0" />
      {values.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onSelect(v)}
          className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-white/40 dark:bg-white/5 border border-white/30 dark:border-white/10 text-ink-muted hover:text-ink-light dark:hover:text-ink-dark hover:border-vlite-cyan/50 transition-colors"
        >
          {v}
        </button>
      ))}
    </div>
  );
}
