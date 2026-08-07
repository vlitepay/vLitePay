"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertOctagon, X } from "lucide-react";
import { useEscrowActions } from "@/hooks/useEscrowActions";
import { notify } from "@/lib/notify";

export function DisputeModal({ tradeId, onResolved }: { tradeId: bigint; onResolved?: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { raiseDispute, busy, error } = useEscrowActions();

  async function handleSubmit() {
    if (!reason.trim()) return;
    // NOTE: evidenceURI is a free-text description for now. Phase 4/5 should
    // upload attached screenshots to IPFS (via the backend's Multer/IPFS
    // endpoint) and store the resulting URI here instead of raw text.
    const hash = await raiseDispute(tradeId, reason.trim());
    if (hash) {
      setOpen(false);
      notify({
        category: "p2p_trade",
        title: `Dispute raised — trade #${tradeId}`,
        message: "Funds stay locked in escrow until an arbiter reviews and resolves this trade.",
        href: `/p2p/trade/${tradeId}`,
      });
      onResolved?.();
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl py-3 text-sm font-semibold text-danger border border-danger/30 hover:bg-danger/10 transition flex items-center justify-center gap-2"
      >
        <AlertOctagon size={15} />
        Raise a dispute
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-panel w-full max-w-sm p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <AlertOctagon size={16} className="text-danger" /> Raise a dispute
                </h3>
                <button onClick={() => setOpen(false)} className="btn-vlite-icon h-8 w-8">
                  <X size={14} />
                </button>
              </div>

              <p className="text-xs text-ink-muted mb-3">
                An arbiter will review this trade's chat, payment proof, and your description below. Funds stay locked
                in escrow until resolved.
              </p>

              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                placeholder="Describe what went wrong (e.g. fiat sent but seller hasn't released)…"
                className="w-full rounded-xl px-3 py-2.5 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-danger resize-none"
              />

              {error && <p className="text-xs text-danger mt-2">{error}</p>}

              <button
                onClick={handleSubmit}
                disabled={busy || !reason.trim()}
                className="w-full mt-3 rounded-2xl py-3 text-sm font-semibold bg-danger text-white disabled:opacity-50 active:scale-[0.97] transition-transform"
              >
                {busy ? "Submitting…" : "Submit dispute"}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
