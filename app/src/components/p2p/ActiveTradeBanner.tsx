"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { Lock, Send as SendIcon, X } from "lucide-react";
import { useVLiteStore } from "@/store/useVLiteStore";
import { useTrade } from "@/hooks/useTrade";
import { useTradeHistory } from "@/hooks/useTradeHistory";
import { TradeStatus } from "@/lib/types/p2p";
import { TOKENS } from "@/lib/constants";
import { formatTokenAmount } from "@/lib/utils";

const STATUS_LABEL: Record<TradeStatus, string> = {
  [TradeStatus.Locked]: "Awaiting fiat payment",
  [TradeStatus.FiatMarked]: "Awaiting release",
  [TradeStatus.Released]: "Released",
  [TradeStatus.Disputed]: "Disputed",
  [TradeStatus.Resolved]: "Resolved",
  [TradeStatus.Cancelled]: "Cancelled",
};

/**
 * Shown on every screen (except the trade page itself, where the full detail
 * is already visible) while the user has a trade in progress. Backed by
 * Zustand (`activeTradeId`, persisted) + a live on-chain read via useTrade.
 */
export function ActiveTradeBanner() {
  const pathname = usePathname();
  const { address } = useAccount();
  const activeTradeId = useVLiteStore((s) => s.activeTradeId);
  const setActiveTradeId = useVLiteStore((s) => s.setActiveTradeId);
  const { trade } = useTrade(activeTradeId);

  const settled =
    !!trade &&
    (trade.status === TradeStatus.Released || trade.status === TradeStatus.Cancelled || trade.status === TradeStatus.Resolved);

  // Trade ids we've already confirmed are settled, via this component's own
  // fresher single-trade read (useTrade) above — NOT via useTradeHistory's
  // independently-cached list below, which can lag behind for a few
  // seconds after a status change. Kept in a ref (not state) since it must
  // never itself trigger a re-render.
  //
  // THE BUG THIS FIXES: previously, settling a trade cleared
  // `activeTradeId` to null, which immediately re-armed the auto-discovery
  // effect below. If useTradeHistory's cached trade list hadn't refetched
  // yet — still showing this exact trade as "FiatMarked" — that effect
  // re-selected the SAME trade id right back, which flipped `settled` back
  // to true next render, which cleared it again... an infinite null → id →
  // null → id loop ("Maximum update depth exceeded"). This only hit the
  // party who just performed the release: their own useTrade read reflects
  // the new status instantly, while useTradeHistory's cached list — used
  // only for auto-discovering trades this session didn't personally
  // trigger — hadn't caught up yet. The other party's next page load reads
  // both fresh from the start, so they never hit the race.
  //
  // The fix: once we know (from useTrade) that a trade is settled, remember
  // its id here and have auto-discovery skip it unconditionally, regardless
  // of what useTradeHistory's list still says, until that list itself
  // catches up and stops returning it at all.
  const settledIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (settled && activeTradeId != null) {
      settledIdsRef.current.add(activeTradeId);
      setActiveTradeId(null);
    }
  }, [settled, activeTradeId, setActiveTradeId]);

  // `activeTradeId` used to only ever get set by the browser session that
  // personally called acceptOffer/markFiatSent — meaning the OTHER party
  // (e.g. a merchant whose offer just got accepted by someone else) had no
  // way to discover a trade needed their attention short of manually
  // checking Profile > History. There's no backend/push layer in this app,
  // so on-chain trade history (already used there) is the only source of
  // truth — this picks up the most recent in-progress trade this wallet is
  // a party to and starts tracking it, without clobbering a trade that's
  // already being tracked, and without re-picking one we just confirmed is settled.
  const { trades: myTrades } = useTradeHistory(address);
  useEffect(() => {
    if (activeTradeId != null) return;
    const inProgress = myTrades.find(
      (t) =>
        (t.status === TradeStatus.Locked || t.status === TradeStatus.FiatMarked) &&
        !settledIdsRef.current.has(Number(t.id))
    );
    if (inProgress) setActiveTradeId(Number(inProgress.id));
  }, [myTrades, activeTradeId, setActiveTradeId]);

  const onTradePage = pathname === `/p2p/trade/${activeTradeId}`;
  const visible = activeTradeId != null && trade && !onTradePage && !settled;

  return (
    <AnimatePresence>
      {visible && trade && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-24 md:bottom-6 inset-x-0 z-30 px-3"
        >
          <Link
            href={`/p2p/trade/${activeTradeId}`}
            className="mx-auto max-w-md md:max-w-sm glass-panel flex items-center gap-3 px-4 py-3 shadow-glow block"
          >
            <div className="h-9 w-9 rounded-full bg-vlite-gradient flex items-center justify-center text-white shrink-0">
              {trade.status === TradeStatus.Locked ? <Lock size={15} /> : <SendIcon size={15} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                Trade #{activeTradeId} · {formatTokenAmount(Number(formatUnits(trade.amount, TOKENS[trade.tokenSymbol].decimals)), trade.tokenSymbol)} {trade.tokenSymbol}
              </p>
              <p className="text-xs text-ink-muted">{STATUS_LABEL[trade.status]}</p>
            </div>
            <button
              onClick={(e) => {
                e.preventDefault();
                setActiveTradeId(null);
              }}
              className="btn-vlite-icon h-7 w-7 shrink-0"
              aria-label="Dismiss"
            >
              <X size={12} />
            </button>
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
