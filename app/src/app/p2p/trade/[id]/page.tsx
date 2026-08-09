"use client";

import { useEffect, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { motion } from "framer-motion";
import { ArrowLeft, Copy, ExternalLink } from "lucide-react";
import { useTrade } from "@/hooks/useTrade";
import { useHasRated } from "@/hooks/useHasRated";
import { useEscrowActions } from "@/hooks/useEscrowActions";
import { useVLiteStore } from "@/store/useVLiteStore";
import { notify } from "@/lib/notify";
import { TradeStatus } from "@/lib/types/p2p";
import { TOKENS } from "@/lib/constants";
import { formatTokenAmount } from "@/lib/utils";
import { TradeStatusStepper } from "@/components/p2p/TradeStatusStepper";
import { TradeTimer } from "@/components/p2p/TradeTimer";
import { TradeChat } from "@/components/p2p/TradeChat";
import { DisputeModal } from "@/components/p2p/DisputeModal";
import { RatingModal } from "@/components/p2p/RatingModal";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function TradeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const tradeId = Number(params.id);
  const { address } = useAccount();

  const { trade, timeRemainingSec, refetch } = useTrade(tradeId);
  const { hasRated, refetch: refetchRated } = useHasRated(trade ? BigInt(tradeId) : null);
  const { markFiatSent, releaseFunds, cancelTrade, busy, confirming, error } = useEscrowActions();
  const setActiveTradeId = useVLiteStore((s) => s.setActiveTradeId);
  const markFirstActionComplete = useVLiteStore((s) => s.markFirstActionComplete);

  // Track this as the user's active trade for the persistent banner elsewhere in the app.
  useEffect(() => {
    if (trade && trade.status !== TradeStatus.Released && trade.status !== TradeStatus.Cancelled && trade.status !== TradeStatus.Resolved) {
      setActiveTradeId(tradeId);
    }
  }, [trade, tradeId, setActiveTradeId]);

  const myRole: "buyer" | "seller" | null = useMemo(() => {
    if (!trade || !address) return null;
    if (address.toLowerCase() === trade.cryptoBuyer.toLowerCase()) return "buyer";
    if (address.toLowerCase() === trade.cryptoSeller.toLowerCase()) return "seller";
    return null;
  }, [trade, address]);

  // Notify the counterparty of status changes they didn't personally trigger
  // (the actor themselves is notified directly from handleAction below).
  const prevStatusRef = useRef<TradeStatus | null>(null);
  useEffect(() => {
    if (!trade || !myRole) return;
    const prev = prevStatusRef.current;
    prevStatusRef.current = trade.status;
    if (prev === null || prev === trade.status) return;

    if (trade.status === TradeStatus.FiatMarked && myRole === "seller") {
      notify({
        category: "escrow",
        title: `Buyer marked fiat sent — trade #${tradeId}`,
        message: "Verify you've received the fiat payment, then release the escrowed funds.",
        href: `/p2p/trade/${tradeId}`,
      });
    } else if (trade.status === TradeStatus.Released && myRole === "buyer") {
      markFirstActionComplete();
      notify({
        category: "escrow",
        title: `Funds released — trade #${tradeId}`,
        message: "The seller released your escrowed funds. Trade complete!",
        href: `/p2p/trade/${tradeId}`,
      });
    } else if (trade.status === TradeStatus.Disputed) {
      notify({
        category: "escrow",
        title: `Trade disputed — trade #${tradeId}`,
        message: "The counterparty raised a dispute. An arbiter will review this trade.",
        href: `/p2p/trade/${tradeId}`,
      });
    } else if (trade.status === TradeStatus.Resolved) {
      notify({
        category: "escrow",
        title: `Dispute resolved — trade #${tradeId}`,
        message: "An arbiter has resolved this trade's dispute.",
        href: `/p2p/trade/${tradeId}`,
      });
    }
  }, [trade?.status, myRole, tradeId, markFirstActionComplete]);

  if (!trade) {
    return <div className="glass-panel h-64 animate-pulse bg-white/40 dark:bg-white/5 mt-4" />;
  }

  const token = TOKENS[trade.tokenSymbol];
  const amount = formatTokenAmount(Number(formatUnits(trade.amount, token.decimals)), trade.tokenSymbol);
  const fiatAmount = Number(trade.fiatAmount) / 100;
  const settled = trade.status === TradeStatus.Released || trade.status === TradeStatus.Resolved;
  const counterparty = myRole === "buyer" ? trade.cryptoSeller : trade.cryptoBuyer;

  async function handleAction(action: "markFiatSent" | "release" | "cancel") {
    let hash;
    if (action === "markFiatSent") hash = await markFiatSent(BigInt(tradeId));
    if (action === "release") hash = await releaseFunds(BigInt(tradeId));
    if (action === "cancel") hash = await cancelTrade(BigInt(tradeId));
    if (hash) {
      refetch();
      if (action === "markFiatSent") {
        notify({
          category: "p2p_trade",
          title: `Fiat marked as sent — trade #${tradeId}`,
          message: "Waiting for the seller to verify and release the escrowed funds.",
          href: `/p2p/trade/${tradeId}`,
        });
      } else if (action === "release") {
        markFirstActionComplete();
        notify({
          category: "p2p_trade",
          title: `Funds released — trade #${tradeId}`,
          message: "You've released the escrowed funds to the buyer.",
          href: `/p2p/trade/${tradeId}`,
        });
      } else if (action === "cancel") {
        notify({
          category: "escrow",
          title: `Trade cancelled — trade #${tradeId}`,
          message: "The escrowed funds have been returned.",
          href: `/p2p/trade/${tradeId}`,
        });
      }
    }
  }

  return (
    <div className="space-y-4 animate-slide-up pb-6">
      <button onClick={() => router.push("/p2p")} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-light dark:hover:text-ink-dark">
        <ArrowLeft size={15} /> Back to P2P
      </button>

      <TradeStatusStepper status={trade.status} />

      {(trade.status === TradeStatus.Locked || trade.status === TradeStatus.FiatMarked) && (
        <TradeTimer secondsLeft={timeRemainingSec} totalSeconds={Number(trade.timerDuration)} />
      )}

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-muted">Amount</span>
          <span className="stat-mono font-semibold">
            {amount} {trade.tokenSymbol}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-muted">Fiat value</span>
          <span className="stat-mono font-semibold">
            {fiatAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} {trade.fiatCurrency}
          </span>
        </div>
        {(trade.makerFeeAmount > 0n || trade.takerFeeAmount > 0n) && (
          <div className="flex items-center justify-between text-xs text-ink-muted">
            <span>Fee (paid by seller{trade.takerFeeAmount > 0n ? " + buyer" : ""})</span>
            <span className="stat-mono">
              {formatTokenAmount(Number(formatUnits(trade.makerFeeAmount + trade.takerFeeAmount, token.decimals)), trade.tokenSymbol)} {trade.tokenSymbol}
            </span>
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="text-sm text-ink-muted">{myRole === "buyer" ? "Seller" : "Buyer"}</span>
          <span className="stat-mono text-sm flex items-center gap-1.5">
            {shortAddr(counterparty)}
            <button onClick={() => navigator.clipboard.writeText(counterparty)} aria-label="Copy address">
              <Copy size={12} className="text-ink-muted hover:text-ink-light dark:hover:text-ink-dark" />
            </button>
          </span>
        </div>
        <a
          href={`https://testnet.arcscan.app/address/${counterparty}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs text-vlite-purple dark:text-vlite-cyan hover:underline"
        >
          View on ArcScan <ExternalLink size={11} />
        </a>
      </motion.div>

      {error && <p className="text-sm text-danger text-center">{error}</p>}

      {/* --- Role-based actions --- */}
      {trade.status === TradeStatus.Locked && myRole === "buyer" && (
        <button onClick={() => handleAction("markFiatSent")} disabled={busy} className="btn-vlite-primary w-full">
          {confirming ? "Confirming on-chain…" : busy ? "Submitting…" : "I have sent the fiat"}
        </button>
      )}

      {trade.status === TradeStatus.FiatMarked && myRole === "seller" && (
        <button onClick={() => handleAction("release")} disabled={busy} className="btn-vlite-primary w-full">
          {confirming ? "Confirming on-chain…" : busy ? "Releasing…" : "Release funds"}
        </button>
      )}

      {trade.status === TradeStatus.Locked && myRole && (
        <button onClick={() => handleAction("cancel")} disabled={busy} className="btn-vlite-secondary w-full">
          {confirming ? "Confirming on-chain…" : busy ? "Cancelling…" : "Cancel trade"}
        </button>
      )}

      {(trade.status === TradeStatus.Locked || trade.status === TradeStatus.FiatMarked) && (
        <DisputeModal tradeId={BigInt(tradeId)} onResolved={refetch} />
      )}

      {myRole && <TradeChat tradeId={tradeId} myRole={myRole} />}

      {settled && myRole && <RatingModal tradeId={BigInt(tradeId)} alreadyRated={hasRated} onSubmitted={refetchRated} />}
    </div>
  );
}
