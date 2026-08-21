"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import clsx from "clsx";
import { TOKENS, TokenSymbol, FIAT_CURRENCIES } from "@/lib/constants";
import { TokenIcon } from "@/components/TokenIcon";
import { useP2PStore } from "@/store/useP2PStore";

function Dropdown<T extends string>({
  value,
  options,
  render,
  onSelect,
}: {
  value: T;
  options: { value: T; label: string; render: React.ReactNode }[];
  render: React.ReactNode;
  onSelect: (v: T) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="glass-panel-flush rounded-2xl px-3.5 py-2.5 flex items-center gap-2 min-w-[110px]"
      >
        {render}
        <ChevronDown size={14} className={clsx("ml-auto text-ink-muted transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.12 }}
            className="glass-panel absolute left-0 mt-2 w-48 p-1.5 z-30 max-h-64 overflow-y-auto"
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  onSelect(opt.value);
                  setOpen(false);
                }}
                className={clsx(
                  "w-full flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-left hover:bg-white/60 dark:hover:bg-white/10 transition",
                  opt.value === value && "bg-white/50 dark:bg-white/10 font-medium"
                )}
              >
                {opt.render}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function CurrencyPairSelector() {
  const selectedToken = useP2PStore((s) => s.selectedToken);
  const selectedFiat = useP2PStore((s) => s.selectedFiat);
  const setSelectedToken = useP2PStore((s) => s.setSelectedToken);
  const setSelectedFiat = useP2PStore((s) => s.setSelectedFiat);

  const tokenSymbols = Object.keys(TOKENS) as TokenSymbol[];
  const fiat = FIAT_CURRENCIES.find((f) => f.code === selectedFiat) ?? FIAT_CURRENCIES[0];

  return (
    <div className="flex items-center gap-2">
      <Dropdown
        value={selectedToken}
        onSelect={setSelectedToken}
        render={
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <TokenIcon symbol={selectedToken} size={20} />
            {selectedToken}
          </span>
        }
        options={tokenSymbols.map((s) => ({
          value: s,
          label: s,
          render: (
            <span className="flex items-center gap-2">
              <TokenIcon symbol={s} size={20} />
              {s}
            </span>
          ),
        }))}
      />

      <span className="text-ink-muted text-sm">→</span>

      <Dropdown
        value={selectedFiat}
        onSelect={setSelectedFiat}
        render={
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <span>{fiat.flag}</span>
            {fiat.code}
          </span>
        }
        options={FIAT_CURRENCIES.map((f) => ({
          value: f.code,
          label: f.code,
          render: (
            <span className="flex items-center gap-2">
              <span>{f.flag}</span>
              <span>
                {f.code} <span className="text-ink-muted font-normal">· {f.label}</span>
              </span>
            </span>
          ),
        }))}
      />
    </div>
  );
}
