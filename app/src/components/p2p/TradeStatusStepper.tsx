"use client";

import clsx from "clsx";
import { Lock, Send, CheckCircle2, Ban, Scale } from "lucide-react";
import { TradeStatus } from "@/lib/types/p2p";

const STEPS = [
  { status: TradeStatus.Locked, label: "Escrow locked", icon: Lock },
  { status: TradeStatus.FiatMarked, label: "Fiat sent", icon: Send },
  { status: TradeStatus.Released, label: "Released", icon: CheckCircle2 },
];

export function TradeStatusStepper({ status }: { status: TradeStatus }) {
  if (status === TradeStatus.Disputed || status === TradeStatus.Resolved) {
    return (
      <div className="glass-panel p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-warning/15 flex items-center justify-center">
          <Scale size={18} className="text-warning" />
        </div>
        <div>
          <p className="font-medium text-sm">{status === TradeStatus.Disputed ? "Dispute under review" : "Dispute resolved"}</p>
          <p className="text-xs text-ink-muted">An arbiter is handling this trade.</p>
        </div>
      </div>
    );
  }

  if (status === TradeStatus.Cancelled) {
    return (
      <div className="glass-panel p-4 flex items-center gap-3">
        <div className="h-10 w-10 rounded-full bg-danger/15 flex items-center justify-center">
          <Ban size={18} className="text-danger" />
        </div>
        <p className="font-medium text-sm">Trade cancelled — funds returned</p>
      </div>
    );
  }

  const currentIndex = STEPS.findIndex((s) => s.status === status);

  return (
    <div className="glass-panel p-5">
      <div className="flex items-center">
        {STEPS.map((step, i) => {
          const done = i < currentIndex;
          const active = i === currentIndex;
          const Icon = step.icon;
          return (
            <div key={step.label} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={clsx(
                    "h-9 w-9 rounded-full flex items-center justify-center transition-colors",
                    done && "bg-vlite-gradient text-white",
                    active && "bg-vlite-gradient text-white shadow-glow animate-pulse-glow",
                    !done && !active && "glass-panel-flush text-ink-muted"
                  )}
                >
                  <Icon size={15} />
                </div>
                <span className={clsx("text-[11px] font-medium whitespace-nowrap", active ? "text-ink-light dark:text-ink-dark" : "text-ink-muted")}>
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div className={clsx("h-0.5 flex-1 mx-1 rounded-full transition-colors", done ? "bg-vlite-gradient" : "bg-white/20 dark:bg-white/10")} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
