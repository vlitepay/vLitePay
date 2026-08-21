"use client";

import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { Info, ChevronDown, Radio } from "lucide-react";
import clsx from "clsx";
import { TOKENS, TokenSymbol, REFERENCE_CURRENCIES, REFERENCE_CURRENCY_REGIONS, ReferenceCurrencyCode } from "@/lib/constants";
import { TokenIcon } from "@/components/TokenIcon";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { useP2PStore } from "@/store/useP2PStore";

const TOKEN_ORDER: TokenSymbol[] = ["USDC", "EURC", "cirBTC"];

function formatRate(value: number) {
  if (value >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (value >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return value.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

export function GlobalReferenceRateCard() {
  const { rates, loading } = useExchangeRates();
  const p2pSelectedFiat = useP2PStore((s) => s.selectedFiat);

  const initialCurrency: ReferenceCurrencyCode = (REFERENCE_CURRENCIES.some((c) => c.code === p2pSelectedFiat)
    ? p2pSelectedFiat
    : "USD") as ReferenceCurrencyCode;

  const [currency, setCurrency] = useState<ReferenceCurrencyCode>(initialCurrency);
  const [pickerOpen, setPickerOpen] = useState(false);

  const selectedMeta = REFERENCE_CURRENCIES.find((c) => c.code === currency) ?? REFERENCE_CURRENCIES[0];
  const fiatPerUsd = rates.fiat[currency] ?? 1;

  const rows = useMemo(
    () =>
      TOKEN_ORDER.map((symbol) => {
        const usdPrice = rates.crypto[symbol];
        const value = usdPrice * fiatPerUsd;
        return { symbol, value };
      }),
    [rates, fiatPerUsd]
  );

  const sourcesLabel = useMemo(() => {
    const parts = new Set<string>();
    parts.add(rates.cryptoSource === "coingecko" ? "CoinGecko" : "cached fallback");
    parts.add(rates.fiatSource === "frankfurter" ? "Frankfurter (ECB + 84 central banks)" : "cached fallback");
    return Array.from(parts).join(" · ");
  }, [rates.cryptoSource, rates.fiatSource]);

  const isLive = rates.cryptoSource !== "fallback" || rates.fiatSource !== "fallback";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="glass-panel relative overflow-hidden p-5"
    >
      <div className="vlite-halo -top-20 -right-16 h-48 w-48 rounded-full" aria-hidden />

      {/* Header */}
      <div className="relative flex items-start justify-between gap-3 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display font-semibold text-sm sm:text-base">Global Reference Rate</h2>
            <span className="pill bg-vlite-gold/15 text-vlite-gold text-[10px] font-semibold uppercase tracking-wide">
              Guide only
            </span>
          </div>
          <p className="text-xs text-ink-muted mt-1">Live market rates — see them before browsing merchant offers</p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
          <span className={clsx("relative flex h-2 w-2", isLive && "animate-pulse-glow")}>
            <span className={clsx("absolute inline-flex h-full w-full rounded-full", isLive ? "bg-success" : "bg-ink-muted")} />
          </span>
          <span className="text-[11px] text-ink-muted flex items-center gap-1">
            <Radio size={11} className={isLive ? "text-success" : "text-ink-muted"} />
            {isLive ? "Live" : "Cached"}
          </span>
        </div>
      </div>

      {/* Currency picker */}
      <div className="relative mb-3">
        <button
          onClick={() => setPickerOpen((v) => !v)}
          className="glass-panel-flush rounded-xl px-3 py-2 flex items-center gap-2 text-sm font-medium w-full sm:w-auto"
        >
          <span>{selectedMeta.flag}</span>
          <span>{selectedMeta.code}</span>
          <span className="text-ink-muted font-normal hidden sm:inline">· {selectedMeta.label}</span>
          <ChevronDown size={13} className={clsx("ml-auto sm:ml-1 text-ink-muted transition-transform", pickerOpen && "rotate-180")} />
        </button>

        <AnimatePresence>
          {pickerOpen && (
            <motion.div
              initial={{ opacity: 0, y: -6, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6, scale: 0.97 }}
              transition={{ duration: 0.12 }}
              className="glass-panel absolute left-0 right-0 sm:right-auto sm:w-72 mt-2 p-3 z-30 max-h-72 overflow-y-auto"
            >
              {Object.entries(REFERENCE_CURRENCY_REGIONS).map(([region, codes]) => (
                <div key={region} className="mb-2 last:mb-0">
                  <p className="text-[10px] uppercase tracking-wide text-ink-muted px-2 mb-1">{region}</p>
                  <div className="grid grid-cols-2 gap-1">
                    {codes.map((code) => {
                      const meta = REFERENCE_CURRENCIES.find((c) => c.code === code)!;
                      return (
                        <button
                          key={code}
                          onClick={() => {
                            setCurrency(code);
                            setPickerOpen(false);
                          }}
                          className={clsx(
                            "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm text-left transition",
                            code === currency ? "bg-vlite-gradient text-white" : "hover:bg-white/60 dark:hover:bg-white/10"
                          )}
                        >
                          <span>{meta.flag}</span>
                          <span className="font-medium">{meta.code}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Rate rows */}
      <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        {rows.map(({ symbol, value }) => {
          const token = TOKENS[symbol];
          return (
            <div key={symbol} className="rounded-2xl bg-white/40 dark:bg-white/5 p-3.5">
              <div className="flex items-center gap-2 mb-1.5">
                <TokenIcon symbol={symbol} size={24} />
                <span className="text-xs text-ink-muted">1 {symbol} ≈</span>
              </div>
              <p className={clsx("stat-mono font-bold text-lg leading-tight", loading && "opacity-50")}>
                {formatRate(value)} <span className="text-sm font-medium text-ink-muted">{currency}</span>
              </p>
            </div>
          );
        })}
      </div>

      {/* Footer: timestamp, sources, disclaimer */}
      <div className="relative mt-4 pt-3 border-t border-white/15 dark:border-white/5 space-y-1.5">
        <p className="text-[11px] text-ink-muted">
          {rates.lastUpdated > 0
            ? `Updated ${formatDistanceToNow(rates.lastUpdated, { addSuffix: true })}`
            : "Using cached reference rates"}
          {" · "}
          {sourcesLabel}
        </p>
        <p className="flex items-start gap-1.5 text-[11px] text-ink-muted">
          <Info size={12} className="shrink-0 mt-0.5" />
          Merchants set their own rates on each offer — this card is a market guide only, not a trading price.
        </p>
      </div>
    </motion.div>
  );
}
