"use client";

import clsx from "clsx";
import { useP2PStore } from "@/store/useP2PStore";

export function BuySellTabs() {
  const tab = useP2PStore((s) => s.tab);
  const setTab = useP2PStore((s) => s.setTab);

  return (
    <div className="glass-panel-flush rounded-2xl p-1 flex">
      {(["buy", "sell"] as const).map((t) => (
        <button
          key={t}
          onClick={() => setTab(t)}
          className={clsx(
            "flex-1 rounded-xl py-2.5 text-sm font-semibold capitalize transition-colors",
            tab === t ? "bg-vlite-gradient text-white shadow-glow" : "text-ink-muted hover:text-ink-light dark:hover:text-ink-dark"
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}
