"use client";

import { useState } from "react";
import { parseUnits } from "viem";
import clsx from "clsx";
import { Plus } from "lucide-react";
import { TOKENS, TokenSymbol, FIAT_CURRENCIES, FiatCode } from "@/lib/constants";
import { OfferSide } from "@/lib/types/p2p";
import { useMerchantActions } from "@/hooks/useMerchantActions";
import { useAllowance } from "@/hooks/useAllowance";
import { useEscrowActions } from "@/hooks/useEscrowActions";

export function MerchantOfferForm({ onCreated }: { onCreated?: () => void }) {
  const { createOffer, busy, error } = useMerchantActions();

  const [side, setSide] = useState<OfferSide>(OfferSide.MerchantSells);
  const [token, setToken] = useState<TokenSymbol>("USDC");
  const [fiat, setFiat] = useState<FiatCode>(FIAT_CURRENCIES[0].code);
  const [rate, setRate] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [terms, setTerms] = useState("");

  const decimals = TOKENS[token].decimals;
  const valid = Number(rate) > 0 && Number(min) > 0 && Number(max) >= Number(min);

  // "I'm selling crypto" offers have P2PEscrow pull funds directly from the
  // MERCHANT's wallet the moment a buyer accepts (see P2PEscrow.acceptOffer,
  // the `o.side == OfferSide.MerchantSells` branch: `safeTransferFrom(o.merchant, ...)`).
  // Without the merchant approving the escrow contract in advance, that
  // transferFrom simply reverts — which is exactly what made "Accept Offer"
  // fail to go through. This form previously just told merchants in text to
  // "approve beforehand"; it's now a real step, reusing the same
  // useAllowance/approveToken pattern the offer-accept page already uses.
  const maxUnits = Number(max) > 0 ? parseUnits(max, decimals) : 0n;
  const { allowance, refetch: refetchAllowance } = useAllowance(token);
  const { approveToken, busy: approveBusy, error: approveError } = useEscrowActions();
  const needsApproval = side === OfferSide.MerchantSells && maxUnits > 0n && allowance < maxUnits;

  async function handleSubmit() {
    if (!valid) return;

    if (needsApproval) {
      const approved = await approveToken(token, maxUnits);
      if (!approved) return;
      await refetchAllowance();
    }

    const rateScaled = parseUnits(rate, 18); // rate is fiat-per-token, scaled 1e18 in the contract
    const minUnits = parseUnits(min, decimals);

    const hash = await createOffer(side, TOKENS[token].address, fiat, rateScaled, minUnits, maxUnits, terms);
    if (hash) {
      setRate("");
      setMin("");
      setMax("");
      setTerms("");
      onCreated?.();
    }
  }

  const isBusy = busy || approveBusy;

  return (
    <div className="glass-panel p-5 space-y-4">
      <h3 className="font-semibold flex items-center gap-2">
        <Plus size={16} className="text-vlite-cyan" /> Post a new offer
      </h3>

      <div className="glass-panel-flush rounded-2xl p-1 flex">
        {[
          { label: "I'm selling crypto", value: OfferSide.MerchantSells },
          { label: "I'm buying crypto", value: OfferSide.MerchantBuys },
        ].map((opt) => (
          <button
            key={opt.label}
            onClick={() => setSide(opt.value)}
            className={clsx(
              "flex-1 rounded-xl py-2 text-xs font-semibold transition-colors",
              side === opt.value ? "bg-vlite-gradient text-white shadow-glow" : "text-ink-muted"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-ink-muted">Token</label>
          <select
            value={token}
            onChange={(e) => setToken(e.target.value as TokenSymbol)}
            className="w-full mt-1 rounded-xl px-3 py-2.5 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
          >
            {(Object.keys(TOKENS) as TokenSymbol[]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-ink-muted">Fiat currency</label>
          <select
            value={fiat}
            onChange={(e) => setFiat(e.target.value as FiatCode)}
            className="w-full mt-1 rounded-xl px-3 py-2.5 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
          >
            {FIAT_CURRENCIES.map((f) => (
              <option key={f.code} value={f.code}>
                {f.flag} {f.code}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs text-ink-muted">Rate ({fiat} per 1 {token})</label>
        <input
          type="number"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="e.g. 1550"
          className="w-full mt-1 stat-mono rounded-xl px-3 py-2.5 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-ink-muted">Min ({token})</label>
          <input
            type="number"
            value={min}
            onChange={(e) => setMin(e.target.value)}
            className="w-full mt-1 stat-mono rounded-xl px-3 py-2.5 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
          />
        </div>
        <div>
          <label className="text-xs text-ink-muted">Max ({token})</label>
          <input
            type="number"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            className="w-full mt-1 stat-mono rounded-xl px-3 py-2.5 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
          />
        </div>
      </div>

      <div>
        <label className="text-xs text-ink-muted">Terms &amp; conditions</label>
        <textarea
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          rows={2}
          placeholder="e.g. Fast release, online 9am-9pm WAT"
          className="w-full mt-1 rounded-xl px-3 py-2.5 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan resize-none"
        />
      </div>

      {side === OfferSide.MerchantSells && (
        <p className="text-[11px] text-ink-muted bg-white/40 dark:bg-white/5 rounded-xl px-3 py-2">
          Selling offers pull funds directly from your wallet when a buyer accepts. If your current approval to the
          escrow contract is below your max amount, posting will first ask you to approve it.
        </p>
      )}

      {(error || approveError) && <p className="text-sm text-danger">{error || approveError}</p>}

      <button onClick={handleSubmit} disabled={!valid || isBusy} className="btn-vlite-primary w-full">
        {isBusy
          ? needsApproval
            ? "Approving…"
            : "Posting…"
          : needsApproval
          ? "Approve & Post Offer"
          : "Post Offer"}
      </button>
    </div>
  );
}
