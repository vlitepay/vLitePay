"use client";

import { useState } from "react";
import clsx from "clsx";
import { AnimatePresence, motion } from "framer-motion";
import { Zap, ChevronDown, Check } from "lucide-react";
import { CCTP_CHAINS } from "@/lib/constants";

/**
 * Small colored-badge "logos" per chain — text/symbol glyphs rather than
 * image assets, so this has no external asset dependency and stays
 * consistent with how TOKENS render their icons elsewhere in the app.
 */
const CHAIN_BADGE: Record<string, { glyph: string; color: string }> = {
  arc: { glyph: "A", color: "#6366F1" },
  base_sepolia: { glyph: "B", color: "#0052FF" },
  arbitrum_sepolia: { glyph: "Ar", color: "#28A0F0" },
  ethereum_sepolia: { glyph: "Ξ", color: "#627EEA" },
  avalanche_fuji: { glyph: "▲", color: "#E84142" },
  solana_devnet: { glyph: "◎", color: "#9945FF" },
};

function ChainBadge({ chainKey, size = 20 }: { chainKey: string; size?: number }) {
  const badge = CHAIN_BADGE[chainKey] ?? { glyph: "?", color: "#94A3B8" };
  return (
    <span
      className="rounded-full flex items-center justify-center text-white font-semibold shrink-0"
      style={{ backgroundColor: badge.color, width: size, height: size, fontSize: size * 0.5 }}
    >
      {badge.glyph}
    </span>
  );
}

export function ChainSelector({ value, onChange }: { value: string; onChange: (key: string) => void }) {
  const [open, setOpen] = useState(false);
  const selected = CCTP_CHAINS.find((c) => c.key === value) ?? CCTP_CHAINS[0];

  return (
    <div>
      <label className="text-xs text-ink-muted mb-1.5 flex items-center gap-1.5">
        <Zap size={12} className="text-vlite-gold" /> Destination chain
      </label>

      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full glass-panel-flush rounded-xl px-3 py-2.5 flex items-center justify-between hover:bg-white/60 dark:hover:bg-white/10 transition"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <ChainBadge chainKey={selected.key} />
            {selected.label}
          </span>
          <ChevronDown size={15} className={clsx("text-ink-muted transition-transform", open && "rotate-180")} />
        </button>

        <AnimatePresence>
          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="glass-panel absolute left-0 right-0 mt-2 z-50 overflow-hidden py-1"
              >
                {CCTP_CHAINS.map((chain) => (
                  <button
                    key={chain.key}
                    onClick={() => {
                      onChange(chain.key);
                      setOpen(false);
                    }}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 text-sm hover:bg-white/40 dark:hover:bg-white/5 transition"
                  >
                    <span className="flex items-center gap-2">
                      <ChainBadge chainKey={chain.key} />
                      {chain.label}
                    </span>
                    {chain.key === value && <Check size={15} className="text-vlite-purple shrink-0" />}
                  </button>
                ))}
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {value !== "arc" && (
        <p className="text-[11px] text-ink-muted mt-2 bg-white/40 dark:bg-white/5 rounded-xl px-3 py-2">
          Cross-chain sends use Circle's CCTP: USDC is burned on Arc and minted natively on the destination chain.
          USDC-only — EURC and cirBTC always stay on Arc.
        </p>
      )}
    </div>
  );
}
