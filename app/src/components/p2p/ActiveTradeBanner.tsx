"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { formatUnits } from "viem";
import { useAccount } from "wagmi";
import { ChevronDown, ChevronUp, Lock, Send as SendIcon, X } from "lucide-react";
import { useVLiteStore } from "@/store/useVLiteStore";
import { useTrade } from "@/hooks/useTrade";
import { useTradeHistory } from "@/hooks/useTradeHistory";
import { useDisputedTrades } from "@/hooks/useDisputedTrades";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useUsernameOf } from "@/hooks/useUsernameRegistry";
import { Trade, TradeStatus } from "@/lib/types/p2p";
import { TOKENS } from "@/lib/constants";
import { formatTokenAmount } from "@/lib/utils";

// Every status the app doesn't yet treat as terminal — i.e. everything except
// Released / Cancelled / Resolved. Kept in sync with the TradeStatus enum
// itself rather than a hardcoded pair, so a future non-terminal status added
// there is picked up here automatically.
const TERMINAL_STATUSES = new Set<TradeStatus>([TradeStatus.Released, TradeStatus.Cancelled, TradeStatus.Resolved]);
const isOpenStatus = (status: TradeStatus) => !TERMINAL_STATUSES.has(status);

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

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

  // BUG FIX: the banner above only ever tracks a single `activeTradeId`, so
  // any other open trade/dispute this wallet is party to (or, for an admin,
  // any other open dispute system-wide) stayed completely invisible until
  // that one resolved. This builds the full "everything still open" list —
  // reusing the exact same data sources already fetched on this page (no new
  // eth_getLogs, no new polling loop) — so a "View all" control can surface
  // the rest without disturbing the single-item banner above.
  const { canAccessAdmin } = useAdminRole();
  const { trades: adminDisputedTrades } = useDisputedTrades();
  const [showAllOpen, setShowAllOpen] = useState(false);

  const openItems: Trade[] = useMemo(() => {
    const source = canAccessAdmin ? adminDisputedTrades : myTrades.filter((t) => isOpenStatus(t.status));
    return [...source].sort((a, b) => {
      const aIsCurrent = activeTradeId != null && Number(a.id) === activeTradeId;
      const bIsCurrent = activeTradeId != null && Number(b.id) === activeTradeId;
      if (aIsCurrent !== bIsCurrent) return aIsCurrent ? -1 : 1;
      return Number(b.lockedAt - a.lockedAt);
    });
  }, [canAccessAdmin, adminDisputedTrades, myTrades, activeTradeId]);

  // Only worth a control when there's something beyond what the banner
  // already shows on its own — an admin with zero personal active trade but
  // open disputes still gets it; a lone trade that's already the banner
  // doesn't produce a second, redundant entry point.
  const extraOpenCount = visible && trade ? openItems.length - 1 : openItems.length;
  const showViewAllControl = !onTradePage && extraOpenCount > 0;

  const counterparty = trade
    ? trade.cryptoBuyer.toLowerCase() === address?.toLowerCase()
      ? trade.cryptoSeller
      : trade.cryptoBuyer
    : undefined;
  const { data: counterpartyUsername } = useUsernameOf(counterparty as `0x${string}` | undefined);
  const counterpartyLabel = counterpartyUsername ? `@${counterpartyUsername}` : counterparty ? shortAddr(counterparty) : "";

  return (
    <AnimatePresence>
      {((visible && trade) || showViewAllControl) && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-24 md:bottom-6 inset-x-0 z-30 px-3"
        >
          <div className="mx-auto max-w-md md:max-w-sm space-y-1.5">
            {showViewAllControl && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowAllOpen((v) => !v)}
                  className="glass-panel flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium text-ink-muted hover:text-ink-light dark:hover:text-ink-dark"
                >
                  {canAccessAdmin ? "View all disputes" : "View all"} ({openItems.length})
                  {showAllOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              </div>
            )}

            {showAllOpen && openItems.length > 0 && (
              <div className="glass-panel max-h-64 overflow-y-auto p-1.5 space-y-1">
                {openItems.map((t) => {
                  const isCurrent = activeTradeId != null && Number(t.id) === activeTradeId;
                  return (
                    <Link
                      key={t.id.toString()}
                      href={`/p2p/trade/${t.id.toString()}`}
                      onClick={() => setShowAllOpen(false)}
                      className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm hover:bg-white/10 dark:hover:bg-white/5"
                    >
                      <span className="truncate">
                        Trade #{t.id.toString()} ·{" "}
                        {formatTokenAmount(Number(formatUnits(t.amount, TOKENS[t.tokenSymbol].decimals)), t.tokenSymbol)}{" "}
                        {t.tokenSymbol}
                        {isCurrent && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-vlite-purple">current</span>}
                      </span>
                      <span className="text-xs text-ink-muted shrink-0">{STATUS_LABEL[t.status]}</span>
                    </Link>
                  );
                })}
              </div>
            )}

            {visible && trade && (
              <Link
                href={`/p2p/trade/${activeTradeId}`}
                data-trade-id={activeTradeId}
                className="glass-panel flex items-center gap-3 px-4 py-3 shadow-glow block"
              >
                <div className="h-9 w-9 rounded-full bg-vlite-gradient flex items-center justify-center text-white shrink-0">
                  {trade.status === TradeStatus.Locked ? <Lock size={15} /> : <SendIcon size={15} />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {counterpartyLabel} · {formatTokenAmount(Number(formatUnits(trade.amount, TOKENS[trade.tokenSymbol].decimals)), trade.tokenSymbol)} {trade.tokenSymbol}
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
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
