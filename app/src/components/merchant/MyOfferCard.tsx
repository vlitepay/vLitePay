"use client";

import { formatUnits } from "viem";
import { Eye, Repeat, TrendingUp, ShieldAlert } from "lucide-react";
import clsx from "clsx";
import { Offer, OfferSide } from "@/lib/types/p2p";
import { TOKENS } from "@/lib/constants";
import { formatTokenAmount } from "@/lib/utils";
import { useMerchantActions } from "@/hooks/useMerchantActions";
import { useAllowance } from "@/hooks/useAllowance";
import { useEscrowActions } from "@/hooks/useEscrowActions";

export function MyOfferCard({ offer, onChanged }: { offer: Offer; onChanged?: () => void }) {
  const { pauseOffer, resumeOffer, busy } = useMerchantActions();
  const token = TOKENS[offer.tokenSymbol];

  // Offers posted before the in-app approval step existed (or ones whose
  // allowance was later revoked/spent) can still be "Active" on-screen while
  // silently failing every time a buyer tries to accept — P2PEscrow pulls
  // funds straight from the merchant's wallet for MerchantSells offers, and
  // that transferFrom reverts without a sufficient approval. Surface that
  // here so it isn't a silent trap, with a one-click fix.
  const { allowance, refetch: refetchAllowance } = useAllowance(offer.tokenSymbol);
  const { approveToken, busy: approveBusy, error: approveError } = useEscrowActions();
  const needsApproval = offer.side === OfferSide.MerchantSells && !offer.paused && allowance < offer.maxAmount;

  async function toggle() {
    const hash = offer.paused ? await resumeOffer(offer.id) : await pauseOffer(offer.id);
    if (hash) onChanged?.();
  }

  async function handleApprove() {
    const approved = await approveToken(offer.tokenSymbol, offer.maxAmount);
    if (approved) await refetchAllowance();
  }

  return (
    <div className="glass-panel p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">
              {offer.side === OfferSide.MerchantSells ? "Selling" : "Buying"} {offer.tokenSymbol}
            </span>
            <span className={clsx("pill", offer.paused ? "bg-warning/15 text-warning" : "bg-success/15 text-success")}>
              {offer.paused ? "Paused" : "Active"}
            </span>
          </div>
          <p className="text-xs text-ink-muted mt-0.5">
            {Number(formatUnits(offer.rate, 18)).toLocaleString()} {offer.fiatCurrency} / {offer.tokenSymbol} · limits{" "}
            {formatTokenAmount(Number(formatUnits(offer.minAmount, token.decimals)), offer.tokenSymbol)}–
            {formatTokenAmount(Number(formatUnits(offer.maxAmount, token.decimals)), offer.tokenSymbol)}
          </p>
        </div>
        <button
          onClick={toggle}
          disabled={busy}
          className={clsx(
            "text-xs font-semibold rounded-full px-3 py-1.5 transition",
            offer.paused ? "bg-vlite-gradient text-white shadow-glow" : "glass-panel-flush hover:bg-white/60 dark:hover:bg-white/10"
          )}
        >
          {offer.paused ? "Resume" : "Pause"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-white/40 dark:bg-white/5 py-2">
          <Eye size={13} className="mx-auto text-ink-muted mb-0.5" />
          <p className="stat-mono text-sm font-semibold">{offer.views.toString()}</p>
          <p className="text-[10px] text-ink-muted">views</p>
        </div>
        <div className="rounded-xl bg-white/40 dark:bg-white/5 py-2">
          <Repeat size={13} className="mx-auto text-ink-muted mb-0.5" />
          <p className="stat-mono text-sm font-semibold">{offer.tradesCount.toString()}</p>
          <p className="text-[10px] text-ink-muted">trades</p>
        </div>
        <div className="rounded-xl bg-white/40 dark:bg-white/5 py-2">
          <TrendingUp size={13} className="mx-auto text-ink-muted mb-0.5" />
          <p className="stat-mono text-sm font-semibold">
            {formatTokenAmount(Number(formatUnits(offer.volume, token.decimals)), offer.tokenSymbol)}
          </p>
          <p className="text-[10px] text-ink-muted">volume</p>
        </div>
      </div>

      {needsApproval && (
        <div className="rounded-xl bg-warning/10 px-3 py-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="flex items-center gap-1.5 text-xs text-warning">
              <ShieldAlert size={13} className="shrink-0" />
              Buyers can't accept this offer yet — approve the escrow contract first.
            </p>
            <button
              onClick={handleApprove}
              disabled={approveBusy}
              className="shrink-0 text-xs font-semibold rounded-full px-3 py-1.5 bg-vlite-gradient text-white shadow-glow"
            >
              {approveBusy ? "Approving…" : "Approve"}
            </button>
          </div>
          {approveError && <p className="text-xs text-danger">{approveError}</p>}
        </div>
      )}
    </div>
  );
}
