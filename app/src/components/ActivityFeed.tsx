"use client";

import { motion } from "framer-motion";
import { ShieldCheck, Star } from "lucide-react";

// Placeholder feed — wired to on-chain TradeLocked/TradeReleased events once
// an indexer/subgraph is in place. Kept here so the Home screen has social
// proof from day one; replace with live data in Phase 3.
const RECENT_TRADES = [
  { pair: "USDC → NGN", merchant: "not_wired", stars: 5, ago: "0m ago" },
  { pair: "EURC → PHP", merchant: "not_wired",stars: 4.9, ago: "0m ago" },
  { pair: "cirBTC → NGN", merchant: "not_wired", stars: 5, ago: "0m ago" },
];

export function ActivityFeed() {
  return (
    <div className="glass-panel p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <ShieldCheck size={15} className="text-success" />
          Live on vLitePay
        </div>
        <span className="text-xs text-ink-muted">128 trading now</span>
      </div>
      <div className="space-y-2.5">
        {RECENT_TRADES.map((t, i) => (
          <motion.div
            key={t.merchant}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            className="flex items-center justify-between text-sm"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{t.pair}</span>
              <span className="text-ink-muted">· @{t.merchant}</span>
            </div>
            <div className="flex items-center gap-2 text-ink-muted">
              <span className="flex items-center gap-0.5 text-vlite-gold">
                <Star size={12} fill="currentColor" /> {t.stars}
              </span>
              <span>{t.ago}</span>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
