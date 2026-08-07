"use client";

import { useMemo, useState } from "react";
import { formatUnits, parseUnits } from "viem";
import { Scale, User, Users, SplitSquareHorizontal } from "lucide-react";
import clsx from "clsx";
import { Trade } from "@/lib/types/p2p";
import { TOKENS } from "@/lib/constants";
import { formatTokenAmount } from "@/lib/utils";
import { useAdminActions } from "@/hooks/useAdminActions";
import { ReceiptAnalyzer } from "./ReceiptAnalyzer";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

type ResolutionMode = "buyer" | "seller" | "custom";
type SplitUnit = "amount" | "percent";

export function DisputeCard({ trade, onResolved }: { trade: Trade; onResolved?: () => void }) {
  const token = TOKENS[trade.tokenSymbol];
  const totalAmount = Number(formatUnits(trade.amount, token.decimals));

  const [mode, setMode] = useState<ResolutionMode>("custom");
  const [splitUnit, setSplitUnit] = useState<SplitUnit>("percent");
  const [buyerPercent, setBuyerPercent] = useState("50");
  const [buyerAmount, setBuyerAmount] = useState(String(totalAmount / 2));
  const [showAnalyzer, setShowAnalyzer] = useState(false);
  const { resolveDispute, busy, error } = useAdminActions();

  // The buyer's award amount, derived from whichever mode/unit is active.
  const amountToBuyer = useMemo(() => {
    if (mode === "buyer") return totalAmount;
    if (mode === "seller") return 0;
    if (splitUnit === "percent") {
      const pct = Math.min(100, Math.max(0, Number(buyerPercent) || 0));
      return (totalAmount * pct) / 100;
    }
    return Math.min(totalAmount, Math.max(0, Number(buyerAmount) || 0));
  }, [mode, splitUnit, buyerPercent, buyerAmount, totalAmount]);

  const amountToSeller = Math.max(totalAmount - amountToBuyer, 0);
  const buyerPct = totalAmount > 0 ? (amountToBuyer / totalAmount) * 100 : 0;
  const valid = amountToBuyer >= 0 && amountToBuyer <= totalAmount;

  async function handleResolve() {
    if (!valid) return;
    const amountToBuyerUnits = parseUnits(amountToBuyer.toFixed(token.decimals), token.decimals);
    if (amountToBuyerUnits > trade.amount) return;
    const hash = await resolveDispute(trade.id, amountToBuyerUnits);
    if (hash) onResolved?.();
  }

  return (
    <div className="glass-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm flex items-center gap-1.5">
          <Scale size={14} className="text-warning" /> Trade #{trade.id.toString()}
        </p>
        <span className="stat-mono text-sm">
          {formatTokenAmount(totalAmount, trade.tokenSymbol)} {trade.tokenSymbol}
        </span>
      </div>

      <div className="text-xs text-ink-muted space-y-1">
        <p>Buyer: <span className="stat-mono">{shortAddr(trade.cryptoBuyer)}</span></p>
        <p>Seller: <span className="stat-mono">{shortAddr(trade.cryptoSeller)}</span></p>
        <p>Fiat: {(Number(trade.fiatAmount) / 100).toLocaleString()} {trade.fiatCurrency}</p>
      </div>

      {trade.evidenceURI && (
        <div className="rounded-xl bg-white/40 dark:bg-white/5 p-3 text-xs">
          <p className="font-medium mb-1">Evidence / description</p>
          <p className="text-ink-muted whitespace-pre-wrap">{trade.evidenceURI}</p>
        </div>
      )}

      <button onClick={() => setShowAnalyzer((v) => !v)} className="text-xs font-medium text-vlite-purple dark:text-vlite-cyan hover:underline">
        {showAnalyzer ? "Hide" : "Open"} AI receipt analyzer
      </button>
      {showAnalyzer && <ReceiptAnalyzer />}

      {/* --- Resolution mode --- */}
      <div className="pt-2 border-t border-white/15 dark:border-white/5 space-y-3">
        <div>
          <label className="text-xs text-ink-muted mb-1.5 block">Resolution</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setMode("buyer")}
              className={clsx(
                "rounded-xl py-2 px-1.5 flex flex-col items-center gap-1 text-[11px] font-medium transition-colors",
                mode === "buyer" ? "bg-vlite-gradient text-white shadow-glow" : "glass-panel-flush text-ink-muted"
              )}
            >
              <User size={14} />
              Full to buyer
            </button>
            <button
              onClick={() => setMode("seller")}
              className={clsx(
                "rounded-xl py-2 px-1.5 flex flex-col items-center gap-1 text-[11px] font-medium transition-colors",
                mode === "seller" ? "bg-vlite-gradient text-white shadow-glow" : "glass-panel-flush text-ink-muted"
              )}
            >
              <Users size={14} />
              Full to seller
            </button>
            <button
              onClick={() => setMode("custom")}
              className={clsx(
                "rounded-xl py-2 px-1.5 flex flex-col items-center gap-1 text-[11px] font-medium transition-colors",
                mode === "custom" ? "bg-vlite-gradient text-white shadow-glow" : "glass-panel-flush text-ink-muted"
              )}
            >
              <SplitSquareHorizontal size={14} />
              Custom split
            </button>
          </div>
        </div>

        {mode === "custom" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs text-ink-muted">Split by</label>
              <div className="flex gap-1 glass-panel-flush rounded-full p-1">
                {(["percent", "amount"] as const).map((u) => (
                  <button
                    key={u}
                    onClick={() => setSplitUnit(u)}
                    className={clsx(
                      "px-3 py-1 rounded-full text-[11px] font-semibold transition-colors",
                      splitUnit === u ? "bg-vlite-gradient text-white" : "text-ink-muted"
                    )}
                  >
                    {u === "percent" ? "%" : token.symbol}
                  </button>
                ))}
              </div>
            </div>

            {splitUnit === "percent" ? (
              <div>
                <label className="text-xs text-ink-muted">Buyer share (%)</label>
                <input
                  type="number"
                  value={buyerPercent}
                  onChange={(e) => setBuyerPercent(e.target.value)}
                  min={0}
                  max={100}
                  className="w-full mt-1 stat-mono rounded-xl px-3 py-2 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
                />
              </div>
            ) : (
              <div>
                <label className="text-xs text-ink-muted">Amount to buyer ({trade.tokenSymbol})</label>
                <input
                  type="number"
                  value={buyerAmount}
                  onChange={(e) => setBuyerAmount(e.target.value)}
                  min={0}
                  max={totalAmount}
                  className="w-full mt-1 stat-mono rounded-xl px-3 py-2 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
                />
              </div>
            )}
          </div>
        )}

        {/* Live preview of the resulting split, always visible regardless of mode */}
        <div className="rounded-xl bg-white/40 dark:bg-white/5 p-3 space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">Buyer receives</span>
            <span className="stat-mono font-semibold">
              {formatTokenAmount(amountToBuyer, trade.tokenSymbol)} {trade.tokenSymbol}
              <span className="text-ink-muted font-normal"> ({buyerPct.toFixed(0)}%)</span>
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">Seller receives</span>
            <span className="stat-mono font-semibold">
              {formatTokenAmount(amountToSeller, trade.tokenSymbol)} {trade.tokenSymbol}
              <span className="text-ink-muted font-normal"> ({(100 - buyerPct).toFixed(0)}%)</span>
            </span>
          </div>
        </div>

        {!valid && <p className="text-xs text-danger">Buyer amount can't exceed the escrowed total.</p>}
      </div>

      {error && <p className="text-xs text-danger">{error}</p>}

      <button onClick={handleResolve} disabled={busy || !valid} className="btn-vlite-primary w-full !py-2.5 text-sm">
        {busy ? "Resolving…" : "Resolve dispute"}
      </button>
    </div>
  );
}
