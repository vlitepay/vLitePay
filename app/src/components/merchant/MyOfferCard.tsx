"use client";

import { useState } from "react";
import { formatUnits } from "viem";
import { AnimatePresence, motion } from "framer-motion";
import { Eye, Repeat, TrendingUp, ShieldAlert, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Offer, OfferSide } from "@/lib/types/p2p";
import { TOKENS } from "@/lib/constants";
import { formatTokenAmount } from "@/lib/utils";
import { useMerchantActions } from "@/hooks/useMerchantActions";
import { useAllowance } from "@/hooks/useAllowance";
import { useEscrowActions } from "@/hooks/useEscrowActions";
import { useDeletedOffersStore } from "@/store/useDeletedOffersStore";

export function MyOfferCard({ offer, onChanged }: { offer: Offer; onChanged?: () => void }) {
  const { pauseOffer, resumeOffer, busy, error: actionError } = useMerchantActions();
  const markDeleted = useDeletedOffersStore((s) => s.markDeleted);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
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

  async function handleDelete() {
    setDeleting(true);
    try {
      // The contract has no cancel/close/deactivate/delete function — only
      // pauseOffer (paused flag) and `active`, which is never set false by
      // anything. If it's already paused (or, defensively, already
      // inactive) there's nothing left to change on-chain: just drop it
      // from MyShop locally. Otherwise reuse the same pauseOffer call Pause
      // already uses — that alone is enough to drop it from the public
      // offer book too (useOffers.ts already filters on active && !paused).
      if (offer.paused || !offer.active) {
        markDeleted(offer.id);
        setConfirmingDelete(false);
        onChanged?.();
        return;
      }
      const hash = await pauseOffer(offer.id);
      if (hash) {
        markDeleted(offer.id);
        setConfirmingDelete(false);
        onChanged?.();
      }
    } finally {
      setDeleting(false);
    }
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
        <div className="flex items-center gap-1.5 shrink-0">
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
          <button
            onClick={() => setConfirmingDelete(true)}
            disabled={busy}
            aria-label="Delete offer"
            className="glass-panel-flush hover:bg-danger/10 hover:text-danger text-ink-muted h-[30px] w-[30px] flex items-center justify-center rounded-full transition"
          >
            <Trash2 size={13} />
          </button>
        </div>
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

      {confirmingDelete && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
            onClick={() => !deleting && setConfirmingDelete(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 40, scale: 0.96 }}
              transition={{ type: "spring", damping: 22, stiffness: 260 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-panel w-full max-w-sm p-6 space-y-4"
            >
              <div className="space-y-1.5 text-center">
                <Trash2 className="mx-auto text-danger" size={26} />
                <h3 className="font-display text-lg font-semibold">Delete this offer?</h3>
                <p className="text-sm text-ink-muted">
                  This removes it from MyShop and the public offer book. This can't be undone from here.
                </p>
              </div>

              {actionError && <p className="text-xs text-danger text-center">{actionError}</p>}

              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmingDelete(false)}
                  disabled={deleting}
                  className="btn-vlite-secondary flex-1 !py-2.5 text-sm"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 !py-2.5 text-sm rounded-full font-semibold bg-danger text-white disabled:opacity-60"
                >
                  {deleting ? "Deleting…" : "Delete"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
