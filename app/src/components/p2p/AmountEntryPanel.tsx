"use client";

import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Offer } from "@/lib/types/p2p";
import { TOKENS } from "@/lib/constants";
import { formatTokenAmount } from "@/lib/utils";
import { RecentSuggestions } from "@/components/shared/RecentSuggestions";
import { useRecentHistoryStore } from "@/store/useRecentHistoryStore";

export function AmountEntryPanel({
  offer,
  amount,
  onAmountChange,
  balance,
  usdPrice,
  isDepositor,
  makerFeeBps,
  takerFeeBps,
}: {
  offer: Offer;
  amount: string;
  onAmountChange: (v: string) => void;
  balance: number;
  usdPrice: number;
  /** True when the current user's own crypto gets locked (Sell tab / MerchantBuys offers) — the maker/seller side of the fee model. */
  isDepositor: boolean;
  /** Charged to the depositor (maker/seller), added on top of the trade amount. */
  makerFeeBps: number;
  /** Charged to the buyer (taker), deducted from what they receive. Defaults to 0%. */
  takerFeeBps: number;
}) {
  const { address } = useAccount();
  const addRecentAmount = useRecentHistoryStore((s) => s.addRecent);
  // Scoped per-token — a recent USDC amount isn't a useful suggestion when
  // the offer being viewed is denominated in cirBTC.
  const recentAmounts = useRecentHistoryStore((s) => s.getRecent(`p2p-amount-${offer.tokenSymbol}`, address));

  const token = TOKENS[offer.tokenSymbol];
  const min = Number(formatUnits(offer.minAmount, token.decimals));
  const max = Number(formatUnits(offer.maxAmount, token.decimals));
  const rate = Number(formatUnits(offer.rate, 18));

  const numericAmount = Number(amount) || 0;
  const usdValue = numericAmount * usdPrice;
  const fiatValue = numericAmount * rate;

  // Maker (seller/depositor) pays a fee on top of the amount they lock.
  const makerFee = numericAmount * (makerFeeBps / 10_000);
  const totalDebit = numericAmount + makerFee;

  // Taker (buyer) has their fee, if any, deducted from what they receive — 0% by default.
  const takerFee = numericAmount * (takerFeeBps / 10_000);
  const buyerReceives = numericAmount - takerFee;

  const projectedBalance = isDepositor ? balance - totalDebit : balance + buyerReceives;

  const belowMin = numericAmount > 0 && numericAmount < min;
  const aboveMax = numericAmount > max;
  const insufficientBalance = isDepositor && totalDebit > balance;
  const hasError = belowMin || aboveMax || insufficientBalance;

  return (
    <div className="glass-panel p-5 space-y-4">
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium text-ink-muted">Amount ({offer.tokenSymbol})</label>
          <button
            onClick={() => onAmountChange(String(isDepositor ? Math.min(balance, max) : max))}
            className="text-xs font-semibold text-vlite-purple dark:text-vlite-cyan hover:underline"
          >
            Max
          </button>
        </div>
        <input
          type="number"
          inputMode="decimal"
          value={amount}
          onChange={(e) => onAmountChange(e.target.value)}
          onBlur={() => {
            if (numericAmount > 0) addRecentAmount(`p2p-amount-${offer.tokenSymbol}`, address, amount);
          }}
          placeholder="0.00"
          className="w-full stat-mono text-3xl font-bold bg-transparent outline-none border-b-2 border-white/20 dark:border-white/10 focus:border-vlite-cyan pb-2 transition-colors"
        />
        <RecentSuggestions values={recentAmounts} onSelect={onAmountChange} />
        <p className="text-xs text-ink-muted mt-1.5 stat-mono">
          Limits: {formatTokenAmount(min, offer.tokenSymbol)}–{formatTokenAmount(max, offer.tokenSymbol)} {offer.tokenSymbol}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white/40 dark:bg-white/5 p-3">
          <p className="text-xs text-ink-muted">USD equivalent</p>
          <p className="stat-mono font-semibold">{usdValue.toLocaleString("en-US", { style: "currency", currency: "USD" })}</p>
        </div>
        <div className="rounded-2xl bg-white/40 dark:bg-white/5 p-3">
          <p className="text-xs text-ink-muted">{offer.fiatCurrency} equivalent</p>
          <p className="stat-mono font-semibold">
            {fiatValue.toLocaleString(undefined, { maximumFractionDigits: 2 })} {offer.fiatCurrency}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between text-sm border-t border-white/15 dark:border-white/5 pt-3">
        <span className="text-ink-muted">Your {offer.tokenSymbol} balance</span>
        <span className="stat-mono">{formatTokenAmount(balance, offer.tokenSymbol)}</span>
      </div>

      {isDepositor ? (
        <>
          {makerFeeBps > 0 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Maker fee ({(makerFeeBps / 100).toFixed(2)}%) — you pay this</span>
              <span className="stat-mono text-warning">+{formatTokenAmount(makerFee, offer.tokenSymbol)} {offer.tokenSymbol}</span>
            </div>
          )}
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>Total debited from your wallet</span>
            <span className="stat-mono">{formatTokenAmount(totalDebit, offer.tokenSymbol)} {offer.tokenSymbol}</span>
          </div>
        </>
      ) : (
        <>
          {takerFeeBps > 0 ? (
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">Taker fee ({(takerFeeBps / 100).toFixed(2)}%) — deducted from what you receive</span>
              <span className="stat-mono text-warning">-{formatTokenAmount(takerFee, offer.tokenSymbol)} {offer.tokenSymbol}</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 text-xs text-success bg-success/10 rounded-xl px-3 py-2">
              <CheckCircle2 size={13} /> No fee for you — the seller covers the maker fee on this trade.
            </div>
          )}
          <div className="flex items-center justify-between text-sm font-semibold">
            <span>You'll receive</span>
            <span className="stat-mono">{formatTokenAmount(buyerReceives, offer.tokenSymbol)} {offer.tokenSymbol}</span>
          </div>
        </>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-muted">Projected balance after trade</span>
        <span className="stat-mono font-semibold">{formatTokenAmount(Math.max(projectedBalance, 0), offer.tokenSymbol)}</span>
      </div>

      {hasError && numericAmount > 0 && (
        <div className="flex items-center gap-2 text-xs text-danger bg-danger/10 rounded-xl px-3 py-2">
          <AlertTriangle size={14} />
          {insufficientBalance
            ? "Amount plus the maker fee exceeds your available balance."
            : belowMin
            ? `Minimum trade amount is ${formatTokenAmount(min, offer.tokenSymbol)} ${offer.tokenSymbol}.`
            : `Maximum trade amount is ${formatTokenAmount(max, offer.tokenSymbol)} ${offer.tokenSymbol}.`}
        </div>
      )}
    </div>
  );
}
