"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import clsx from "clsx";
import { SendPanel } from "@/components/transfer/SendPanel";
import { SwapPanel } from "@/components/transfer/SwapPanel";
import { DepositPanel } from "@/components/transfer/DepositPanel";
import { UsernameCard } from "@/components/transfer/UsernameCard";

function TransferTabs() {
  const searchParams = useSearchParams();
  const initialTabParam = searchParams.get("tab");
  const initialTab =
    initialTabParam === "deposit" ? "deposit" : initialTabParam === "swap" ? "swap" : "send";
  const [tab, setTab] = useState<"send" | "swap" | "deposit">(initialTab);

  return (
    <div className="space-y-4 animate-slide-up pb-6">
      <h1 className="font-display text-xl font-semibold">Transfer &amp; Deposit</h1>

      <div className="glass-panel-flush rounded-2xl p-1 flex">
        {(["send", "swap", "deposit"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "flex-1 rounded-xl py-2.5 text-sm font-semibold capitalize transition-colors",
              tab === t ? "bg-vlite-gradient text-white shadow-glow" : "text-ink-muted"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "send" ? (
        <>
          <SendPanel />
          <UsernameCard />
        </>
      ) : tab === "swap" ? (
        <SwapPanel />
      ) : (
        <DepositPanel />
      )}
    </div>
  );
}

export default function TransferPage() {
  return (
    <Suspense fallback={<div className="glass-panel h-64 animate-pulse bg-white/40 dark:bg-white/5 mt-4" />}>
      <TransferTabs />
    </Suspense>
  );
}
