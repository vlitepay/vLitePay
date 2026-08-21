"use client";

import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import { TOKENS, TokenSymbol } from "@/lib/constants";
import { formatTokenAmount } from "@/lib/utils";
import { TokenIcon } from "@/components/TokenIcon";
import type { TokenReadStatus } from "@/hooks/useTokenBalances";

export function BalanceList({
  balances,
  prices,
  statuses,
  hidden = false,
}: {
  balances: Record<TokenSymbol, number>;
  prices: Record<TokenSymbol, number>;
  /** Optional — when provided, a failed on-chain read is shown distinctly from a confirmed zero balance. */
  statuses?: Record<TokenSymbol, TokenReadStatus>;
  /** Mirrors the Home screen's portfolio-value eye toggle — masks amounts here too, per that same preference. */
  hidden?: boolean;
}) {
  const symbols = Object.keys(TOKENS) as TokenSymbol[];

  return (
    <div className="glass-panel overflow-hidden divide-y divide-white/20 dark:divide-white/5">
      {symbols.map((symbol, i) => {
        const token = TOKENS[symbol];
        const amount = balances[symbol];
        const usd = amount * prices[symbol];
        const failed = statuses?.[symbol] === "error";
        return (
          <motion.div
            key={symbol}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.06, duration: 0.35 }}
            whileTap={{ scale: 0.98, transition: { duration: 0.1 } }}
            className="flex items-center justify-between px-5 py-4 transition-colors duration-150 hover:bg-white/40 dark:hover:bg-white/5 rounded-2xl"
          >
            <div className="flex items-center gap-3">
              <TokenIcon symbol={symbol} size={40} />
              <div>
                <p className="font-medium">{token.symbol}</p>
                <p className="text-xs text-ink-muted">{token.name}</p>
              </div>
            </div>
            <div className="text-right">
              {failed ? (
                <p className="flex items-center justify-end gap-1 text-xs text-warning font-medium">
                  <AlertTriangle size={12} /> Couldn't load
                </p>
              ) : (
                <>
                  <p className="stat-mono font-semibold">{hidden ? "••••" : formatTokenAmount(amount, symbol)}</p>
                  <p className="text-xs text-ink-muted stat-mono">
                    {hidden ? "••••" : usd.toLocaleString("en-US", { style: "currency", currency: "USD" })}
                  </p>
                </>
              )}
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
