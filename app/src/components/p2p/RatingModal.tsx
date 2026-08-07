"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Star, PartyPopper } from "lucide-react";
import confetti from "canvas-confetti";
import { useEscrowActions } from "@/hooks/useEscrowActions";
import { VLiteLogo } from "@/components/VLiteLogo";
import { VLiteWordmark } from "@/components/VLiteWordmark";
import { notify } from "@/lib/notify";

function fireConfetti() {
  const colors = ["#22D3EE", "#7C3AED", "#FBBF24", "#6366F1"];
  confetti({ particleCount: 90, spread: 75, origin: { y: 0.65 }, colors, scalar: 0.9, ticks: 200 });
  confetti({ particleCount: 50, spread: 100, origin: { y: 0.6 }, colors, scalar: 1.1, ticks: 200, angle: 60 });
  confetti({ particleCount: 50, spread: 100, origin: { y: 0.6 }, colors, scalar: 1.1, ticks: 200, angle: 120 });
}

export function RatingModal({
  tradeId,
  alreadyRated,
  onSubmitted,
}: {
  tradeId: bigint;
  alreadyRated: boolean;
  onSubmitted?: () => void;
}) {
  const [open, setOpen] = useState(!alreadyRated);
  const [stars, setStars] = useState(0);
  const [hoverStars, setHoverStars] = useState(0);
  const [comment, setComment] = useState("");
  const [celebrated, setCelebrated] = useState(false);
  const { rateTrade, busy, error } = useEscrowActions();

  useEffect(() => {
    if (open && !celebrated) {
      fireConfetti();
      setCelebrated(true);
    }
  }, [open, celebrated]);

  if (!open) return null;

  async function handleSubmit() {
    if (stars === 0) return;
    const hash = await rateTrade(tradeId, stars, comment.trim());
    if (hash) {
      setOpen(false);
      notify({
        category: "p2p_trade",
        title: `Rating submitted — trade #${tradeId}`,
        message: `You gave this trade ${stars} star${stars > 1 ? "s" : ""}. Thanks for the feedback!`,
        href: `/p2p/trade/${tradeId}`,
      });
      onSubmitted?.();
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
      >
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 40, scale: 0.96 }}
          transition={{ type: "spring", damping: 22, stiffness: 260 }}
          className="glass-panel w-full max-w-sm p-6 text-center relative overflow-hidden"
        >
          <div className="vlite-halo -top-16 left-1/2 -translate-x-1/2 h-40 w-40 rounded-full" aria-hidden />

          <div className="relative flex flex-col items-center gap-2">
            <VLiteLogo size={48} withHalo />
            <VLiteWordmark size="text-lg" />
            <div className="flex items-center gap-1.5 text-success font-semibold mt-1">
              <PartyPopper size={18} />
              Trade complete!
            </div>
            <p className="text-sm text-ink-muted">How was your experience with this trade?</p>

            <div className="flex gap-1.5 mt-2">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onMouseEnter={() => setHoverStars(n)}
                  onMouseLeave={() => setHoverStars(0)}
                  onClick={() => setStars(n)}
                  aria-label={`${n} star${n > 1 ? "s" : ""}`}
                >
                  <Star
                    size={30}
                    className="transition-transform active:scale-90"
                    fill={(hoverStars || stars) >= n ? "#FBBF24" : "none"}
                    stroke={(hoverStars || stars) >= n ? "#FBBF24" : "currentColor"}
                  />
                </button>
              ))}
            </div>

            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Leave a comment for the merchant (optional)…"
              className="w-full mt-3 rounded-xl px-3 py-2.5 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan resize-none"
            />

            {error && <p className="text-xs text-danger">{error}</p>}

            <div className="flex gap-2 w-full mt-2">
              <button onClick={() => setOpen(false)} className="btn-vlite-secondary flex-1 !py-2.5 text-sm">
                Skip
              </button>
              <button onClick={handleSubmit} disabled={stars === 0 || busy} className="btn-vlite-primary flex-1 !py-2.5 text-sm">
                {busy ? "Submitting…" : "Submit rating"}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
