"use client";

import clsx from "clsx";

export function AirtimeDataToggle({ value, onChange }: { value: "airtime" | "data"; onChange: (v: "airtime" | "data") => void }) {
  return (
    <div className="glass-panel-flush rounded-2xl p-1 flex">
      {(["airtime", "data"] as const).map((t) => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={clsx(
            "flex-1 rounded-xl py-2.5 text-sm font-semibold capitalize transition-colors",
            value === t ? "bg-vlite-gradient text-white shadow-glow" : "text-ink-muted"
          )}
        >
          {t === "airtime" ? "Airtime" : "Data"}
        </button>
      ))}
    </div>
  );
}
