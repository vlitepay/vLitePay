"use client";

import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { ShieldCheck, Star } from "lucide-react";
import { useRecentSettledTrades } from "@/hooks/useRecentSettledTrades";
import { useUsernameOf } from "@/hooks/useUsernameRegistry";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

interface ActivityRow {
  id: string;
  pair: string;
  merchant: `0x${string}` | null;
  stars: number | null;
  activityAt: number;
}

/**
 * One row per trade, same reason OfferList renders one OfferCard per offer
 * rather than looping useUsernameOf directly inside a .map: it's a single-
 * address hook, so each row needs to be its own component to call it.
 */
function ActivityFeedRow({ row, delay }: { row: ActivityRow; delay: number }) {
  // Same reverseResolve lookup OfferCard already uses for merchant names —
  // falls back to the truncated address when nothing is registered.
  const { data: username } = useUsernameOf(row.merchant ?? undefined);
  const merchantLabel = row.merchant ? username || shortAddr(row.merchant) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="flex items-center justify-between text-sm"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="font-medium">{row.pair}</span>
        {merchantLabel && <span className="text-ink-muted truncate">· {merchantLabel}</span>}
      </div>
      <div className="flex items-center gap-2 text-ink-muted shrink-0">
        {row.stars != null && (
          <span className="flex items-center gap-0.5 text-vlite-gold">
            <Star size={12} fill="currentColor" /> {row.stars.toFixed(1)}
          </span>
        )}
        <span>{row.activityAt > 0 ? formatDistanceToNow(row.activityAt * 1000, { addSuffix: true }) : ""}</span>
      </div>
    </motion.div>
  );
}

/**
 * Was a hardcoded RECENT_TRADES array ("Placeholder feed — wired to
 * on-chain TradeLocked/TradeReleased events once an indexer/subgraph is in
 * place"). Now sourced from useRecentSettledTrades.ts — the same bounded,
 * eth_call-only scan (no eth_getLogs) that also backs OfferCard's rating
 * average, so this and the offer list share one scan rather than each
 * running its own.
 */
export function ActivityFeed() {
  const { trades, isLoading } = useRecentSettledTrades();

  const rows: ActivityRow[] = trades
    .map((t) => {
      const ratingTimestamps = t.ratings.map((r) => Number(r.timestamp));
      // Prefer the moment it was actually rated (closest thing to "recent
      // activity" this contract exposes) — falling back to when fiat was
      // marked sent, then when it was locked, for a trade with no rating
      // yet. No releasedAt/resolvedAt field exists on Trade to use instead.
      const activityAt =
        ratingTimestamps.length > 0 ? Math.max(...ratingTimestamps) : Number(t.fiatMarkedAt || t.lockedAt);
      const stars = t.ratings.length > 0 ? t.ratings.reduce((sum, r) => sum + r.stars, 0) / t.ratings.length : null;
      return {
        id: t.id.toString(),
        pair: `${t.tokenSymbol} → ${t.fiatCurrency}`,
        merchant: t.merchant ?? null,
        stars,
        activityAt,
      };
    })
    .sort((a, b) => b.activityAt - a.activityAt)
    .slice(0, 5);

  return (
    <div className="glass-panel p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <ShieldCheck size={15} className="text-success" />
          Live on vLitePay
        </div>
        <span className="text-xs text-ink-muted">128 trading now</span>
      </div>

      {isLoading ? (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-5 rounded-lg bg-white/40 dark:bg-white/5 animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-ink-muted text-center py-2">No completed trades yet — be the first!</p>
      ) : (
        <div className="space-y-2.5">
          {rows.map((row, i) => (
            <ActivityFeedRow key={row.id} row={row} delay={i * 0.08} />
          ))}
        </div>
      )}
    </div>
  );
}
