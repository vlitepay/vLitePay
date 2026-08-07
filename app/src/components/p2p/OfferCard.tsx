"use client";

import Link from "next/link";
import { formatUnits } from "viem";
import { motion } from "framer-motion";
import { Star, ShieldCheck } from "lucide-react";
import { Offer } from "@/lib/types/p2p";
import { TOKENS } from "@/lib/constants";
import { formatTokenAmount } from "@/lib/utils";
import { useUsernameOf } from "@/hooks/useUsernameRegistry";
import { useProfileStore } from "@/store/useProfileStore";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function OfferCard({ offer, index }: { offer: Offer; index: number }) {
  const token = TOKENS[offer.tokenSymbol];
  const rate = Number(formatUnits(offer.rate, 18));
  const min = Number(formatUnits(offer.minAmount, token.decimals));
  const max = Number(formatUnits(offer.maxAmount, token.decimals));

  // Same reverseResolve lookup already used successfully on the Profile
  // page — falls back to the truncated address below when the merchant
  // hasn't registered a username.
  const { data: merchantUsername } = useUsernameOf(offer.merchant);
  const displayName = merchantUsername || shortAddr(offer.merchant);

  // Same avatar source Profile page and the header dropdown already use —
  // falls back to the initials badge (unchanged from before) when the
  // merchant has no profile image set.
  const merchantAvatarUrl = useProfileStore((s) => s.getProfile(offer.merchant).avatarDataUrl);

  // Placeholder rating until Phase 4 wires up aggregated on-chain rating averages per merchant.
  const displayRating = 4.6 + ((Number(offer.id) * 7) % 4) / 10;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.3), duration: 0.3 }}
    >
      <Link
        href={`/p2p/offer/${offer.id}`}
        className="glass-panel flex items-center justify-between p-4 hover:-translate-y-0.5 transition-transform block"
      >
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-full overflow-hidden shrink-0 bg-vlite-gradient flex items-center justify-center text-white font-semibold">
            {merchantAvatarUrl ? (
              <img src={merchantAvatarUrl} alt={displayName} className="h-full w-full object-cover" />
            ) : (
              shortAddr(offer.merchant).slice(2, 4).toUpperCase()
            )}
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-sm truncate max-w-[140px]">{displayName}</span>
              <ShieldCheck size={13} className="text-success shrink-0" />
            </div>
            <div className="flex items-center gap-1 text-xs text-ink-muted">
              <Star size={11} fill="currentColor" className="text-vlite-gold" />
              {displayRating.toFixed(1)} · {offer.tradesCount.toString()} trades
            </div>
          </div>
        </div>

        <div className="text-right">
          <p className="stat-mono font-semibold">
            {rate.toLocaleString(undefined, { maximumFractionDigits: 2 })} {offer.fiatCurrency}
          </p>
          <p className="text-xs text-ink-muted stat-mono">
            {formatTokenAmount(min, offer.tokenSymbol)}–{formatTokenAmount(max, offer.tokenSymbol)} {offer.tokenSymbol}
          </p>
        </div>
      </Link>
    </motion.div>
  );
}
