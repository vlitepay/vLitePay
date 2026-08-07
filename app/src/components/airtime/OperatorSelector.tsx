"use client";

import Image from "next/image";
import clsx from "clsx";
import { AlertTriangle } from "lucide-react";
import { ReloadlyOperator } from "@/lib/types/reloadly";

export function OperatorSelector({
  operators,
  loading,
  error,
  selectedId,
  onSelect,
}: {
  operators: ReloadlyOperator[];
  loading: boolean;
  error: string | null;
  selectedId: number | null;
  onSelect: (operator: ReloadlyOperator) => void;
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-3 gap-2">
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass-panel-flush h-16 rounded-xl animate-pulse bg-white/40 dark:bg-white/5" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-xs text-danger bg-danger/10 rounded-xl px-3 py-2">
        <AlertTriangle size={14} className="shrink-0" /> {error}
      </div>
    );
  }

  if (operators.length === 0) {
    return <p className="text-xs text-ink-muted">No operators found for this country/mode.</p>;
  }

  return (
    <div className="grid grid-cols-3 gap-2">
      {operators.map((op) => (
        <button
          key={op.id}
          onClick={() => onSelect(op)}
          className={clsx(
            "rounded-xl py-2.5 px-2 flex flex-col items-center gap-1.5 transition-colors",
            selectedId === op.id ? "bg-vlite-gradient text-white shadow-glow" : "glass-panel-flush text-ink-muted"
          )}
        >
          {op.logoUrls?.[0] ? (
            <div className="h-6 w-6 rounded-full overflow-hidden bg-white/80 relative shrink-0">
              <Image src={op.logoUrls[0]} alt={op.name} fill className="object-contain" unoptimized />
            </div>
          ) : (
            <div className="h-6 w-6 rounded-full bg-vlite-gradient shrink-0" />
          )}
          <span className="text-[11px] font-medium text-center leading-tight line-clamp-2">{op.name}</span>
        </button>
      ))}
    </div>
  );
}
