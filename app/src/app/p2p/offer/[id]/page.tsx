"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useReadContract, useAccount } from "wagmi";
import { parseUnits } from "viem";
import { motion } from "framer-motion";
import { ShieldCheck, Clock, ArrowLeft } from "lucide-react";
import clsx from "clsx";
import { CONTRACTS, TOKENS } from "@/lib/constants";
import { formatTokenAmount } from "@/lib/utils";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";
import { Offer, OfferSide } from "@/lib/types/p2p";
import { AmountEntryPanel } from "@/components/p2p/AmountEntryPanel";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { useAllowance } from "@/hooks/useAllowance";
import { useEscrowActions } from "@/hooks/useEscrowActions";
import { useProtocolFee } from "@/hooks/useProtocolFee";
import { useMerchantAvatars } from "@/hooks/useMerchantAvatars";
import { useUsernameOf } from "@/hooks/useUsernameRegistry";
import { useVLiteStore } from "@/store/useVLiteStore";
import { notify } from "@/lib/notify";

export default function OfferDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const offerId = BigInt(params.id);
  const { address } = useAccount();

  const { data: rawOffer, isLoading } = useReadContract({
    address: CONTRACTS.p2pEscrow,
    abi: p2pEscrowAbi,
    functionName: "getOffer",
    args: [offerId],
    query: { enabled: !!CONTRACTS.p2pEscrow },
  });

  const offer: Offer | null = useMemo(() => {
    if (!rawOffer) return null;
    const o = rawOffer as any;
    const symbol = (Object.keys(TOKENS) as (keyof typeof TOKENS)[]).find(
      (s) => TOKENS[s].address.toLowerCase() === o.token.toLowerCase()
    );
    return { ...o, tokenSymbol: symbol ?? "USDC" };
  }, [rawOffer]);

  const { balances } = useTokenBalances();
  const { rates } = useExchangeRates();
  const { makerFeeBps, takerFeeBps } = useProtocolFee();
  const { allowance, refetch: refetchAllowance } = useAllowance(offer?.tokenSymbol ?? "USDC");
  const { approveToken, acceptOffer, busy, confirming, error } = useEscrowActions();
  // Resolved from Supabase by merchant address — works for any viewer, not
  // just the merchant viewing their own offer (see hooks/useMerchantAvatars.ts).
  const merchantAvatars = useMerchantAvatars([offer?.merchant]);
  // Same on-chain reverseResolve lookup OfferCard already uses — falls back
  // to the truncated address below when the merchant has no username.
  const { data: merchantUsername } = useUsernameOf(offer?.merchant);
  const setActiveTradeId = useVLiteStore((s) => s.setActiveTradeId);

  const [amount, setAmount] = useState("");
  const [useAlternateTimer, setUseAlternateTimer] = useState(false);

  // "isDepositor" means the current user is the one locking crypto into escrow when
  // accepting this offer — i.e. the maker/seller side of the fee model, who pays the
  // maker fee on top of the trade amount. The buyer (taker) never pays anything extra.
  const isDepositor = offer?.side === OfferSide.MerchantBuys;
  const decimals = offer ? TOKENS[offer.tokenSymbol].decimals : 6;
  const numericAmount = Number(amount) || 0;
  const amountUnits = offer && amount ? (() => {
    try {
      return parseUnits(amount, decimals);
    } catch {
      return 0n;
    }
  })() : 0n;

  // Mirrors the contract's exact integer math — (amount * feeBps) / 10_000 — so the
  // approval/deposit total always matches what P2PEscrow will actually pull.
  const makerFeeUnits = (amountUnits * BigInt(makerFeeBps)) / 10_000n;
  const depositTotalUnits = amountUnits + makerFeeUnits;
  const needsApproval = isDepositor && allowance < depositTotalUnits;

  const rate = offer ? Number(offer.rate) / 1e18 : 0;
  const fiatValue = numericAmount * rate;
  const fiatAmountScaled = BigInt(Math.round(fiatValue * 100)); // 2dp-scaled, matches contract's informational fiatAmount

  const min = offer ? Number(offer.minAmount) / 10 ** decimals : 0;
  const max = offer ? Number(offer.maxAmount) / 10 ** decimals : 0;
  const makerFeeAmount = numericAmount * (makerFeeBps / 10_000);
  const totalDebitIfDepositor = numericAmount + makerFeeAmount;
  const valid =
    offer &&
    numericAmount >= min &&
    numericAmount <= max &&
    (!isDepositor || totalDebitIfDepositor <= (balances[offer.tokenSymbol] ?? 0));

  async function handleAccept() {
    if (!offer || !valid) return;

    if (needsApproval) {
      const approved = await approveToken(offer.tokenSymbol, depositTotalUnits);
      if (!approved) return;
      await refetchAllowance();
    }

    const result = await acceptOffer(offerId, amountUnits, fiatAmountScaled, useAlternateTimer);
    if (result?.tradeId != null) {
      setActiveTradeId(Number(result.tradeId));
      notify({
        category: "p2p_trade",
        title: "Offer accepted — funds locked",
        message: isDepositor
          ? `${amount} ${offer.tokenSymbol} (plus a ${(makerFeeBps / 100).toFixed(2)}% maker fee) is now held in escrow for trade #${result.tradeId}.`
          : `${amount} ${offer.tokenSymbol} is now held in escrow for trade #${result.tradeId}.`,
        href: `/p2p/trade/${result.tradeId}`,
      });
      router.push(`/p2p/trade/${result.tradeId}`);
    }
  }

  if (isLoading || !offer) {
    return <div className="glass-panel h-64 animate-pulse bg-white/40 dark:bg-white/5 mt-4" />;
  }

  return (
    <div className="space-y-4 animate-slide-up pb-6">
      <button onClick={() => router.back()} className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-light dark:hover:text-ink-dark">
        <ArrowLeft size={15} /> Back to offers
      </button>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full overflow-hidden shrink-0 bg-vlite-gradient flex items-center justify-center text-white font-semibold">
              {merchantAvatars[offer.merchant.toLowerCase()] ? (
                <img
                  src={merchantAvatars[offer.merchant.toLowerCase()]}
                  alt={offer.merchant}
                  className="h-full w-full object-cover"
                />
              ) : (
                offer.merchant.slice(2, 4).toUpperCase()
              )}
            </div>
            <div>
              <div className="flex items-center gap-1.5 font-medium">
                {merchantUsername || `${offer.merchant.slice(0, 6)}…${offer.merchant.slice(-4)}`}
                <ShieldCheck size={14} className="text-success" />
              </div>
              <p className="text-xs text-ink-muted">
                {offer.tradesCount.toString()} trades · {formatTokenAmount(Number(offer.volume) / 10 ** decimals, offer.tokenSymbol)} {offer.tokenSymbol} volume
              </p>
            </div>
          </div>
          <span className={clsx("pill", isDepositor ? "bg-vlite-purple/15 text-vlite-purple" : "bg-vlite-cyan/15 text-vlite-cyan")}>
            {isDepositor ? "You sell" : "You buy"}
          </span>
        </div>

        {offer.terms && (
          <p className="text-sm text-ink-muted mt-4 rounded-2xl bg-white/40 dark:bg-white/5 p-3">{offer.terms}</p>
        )}
      </motion.div>

      <AmountEntryPanel
        offer={offer}
        amount={amount}
        onAmountChange={setAmount}
        balance={balances[offer.tokenSymbol] ?? 0}
        usdPrice={rates.crypto[offer.tokenSymbol]}
        isDepositor={isDepositor}
        makerFeeBps={makerFeeBps}
        takerFeeBps={takerFeeBps}
      />

      <div className="glass-panel p-4">
        <p className="text-sm font-medium mb-2 flex items-center gap-1.5">
          <Clock size={14} className="text-vlite-gold" /> Release window
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: "24 hours", alt: false },
            { label: "48 hours", alt: true },
          ].map((opt) => (
            <button
              key={opt.label}
              onClick={() => setUseAlternateTimer(opt.alt)}
              className={clsx(
                "rounded-xl py-2.5 text-sm font-medium transition-colors",
                useAlternateTimer === opt.alt ? "bg-vlite-gradient text-white shadow-glow" : "glass-panel-flush text-ink-muted"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-danger text-center">{error}</p>}

      <button onClick={handleAccept} disabled={!valid || busy || !address} className="btn-vlite-primary w-full">
        {!address
          ? "Connect wallet to trade"
          : confirming
          ? "Confirming on-chain…"
          : busy
          ? needsApproval
            ? "Approving…"
            : "Locking escrow…"
          : needsApproval
          ? `Approve & Accept Offer`
          : `Accept Offer`}
      </button>

      <p className="text-[11px] text-ink-muted text-center px-4">
        All amounts above are shown before you confirm — nothing is locked in escrow until you accept.
      </p>
    </div>
  );
}
