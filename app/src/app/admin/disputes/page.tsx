"use client";

import Link from "next/link";
import { formatUnits } from "viem";
import { ArrowLeft, History } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { useDisputedTrades } from "@/hooks/useDisputedTrades";
import { DisputeCard } from "@/components/admin/DisputeCard";
import { TOKENS } from "@/lib/constants";
import { formatTokenAmount } from "@/lib/utils";

export default function AdminDisputesPage() {
  const { trades, resolvedTrades, isLoading, refetch } = useDisputedTrades();

  return (
    <AdminGate>
      <div className="space-y-4 animate-slide-up">
        <Link href="/admin" className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-light dark:hover:text-ink-dark">
          <ArrowLeft size={15} /> Back to admin
        </Link>
        <h1 className="font-display text-xl font-semibold">Dispute Dashboard</h1>

        {isLoading ? (
          <div className="glass-panel h-32 animate-pulse bg-white/40 dark:bg-white/5" />
        ) : trades.length === 0 ? (
          <div className="glass-panel p-6 text-center text-sm text-ink-muted">No active disputes. 🎉</div>
        ) : (
          <div className="space-y-3">
            {trades.map((t) => (
              <DisputeCard key={t.id.toString()} trade={t} onResolved={refetch} />
            ))}
          </div>
        )}

        {resolvedTrades.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold text-ink-muted mb-2 px-1 flex items-center gap-1.5">
              <History size={14} /> Resolved history
            </h2>
            <div className="space-y-2">
              {resolvedTrades.map((t) => (
                <div key={t.id.toString()} className="glass-panel flex items-center justify-between p-3.5 text-sm">
                  <span>Trade #{t.id.toString()}</span>
                  <span className="stat-mono text-ink-muted">
                    {formatTokenAmount(Number(formatUnits(t.amount, TOKENS[t.tokenSymbol].decimals)), t.tokenSymbol)} {t.tokenSymbol}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AdminGate>
  );
}
