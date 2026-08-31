"use client";

import { useMemo, useState } from "react";
import { parseUnits } from "viem";
import { motion } from "framer-motion";
import { CheckCircle2, ExternalLink } from "lucide-react";
import clsx from "clsx";
import { TOKENS, TokenSymbol, CCTP_CHAINS } from "@/lib/constants";
import { TokenIcon } from "@/components/TokenIcon";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { useLocalSend, useCctpSend } from "@/hooks/useSend";
import { RecipientInput } from "./RecipientInput";
import { ChainSelector } from "./ChainSelector";
import { formatTokenAmount } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { useVLiteStore } from "@/store/useVLiteStore";

// Reuses the P2P protocol fee reader's shape — sendFeeBps is a sibling config
// value on the same contract, so we read it directly here for simplicity.
import { useReadContract } from "wagmi";
import { CONTRACTS } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";

function useSendFee() {
  const { data } = useReadContract({
    address: CONTRACTS.p2pEscrow,
    abi: p2pEscrowAbi,
    functionName: "sendFeeBps",
    query: { enabled: !!CONTRACTS.p2pEscrow },
  });
  return { feeBps: data ? Number(data) : 25 };
}

export function SendPanel() {
  const { balances } = useTokenBalances();
  const { rates } = useExchangeRates();
  const { feeBps } = useSendFee();

  const [recipientInput, setRecipientInput] = useState("");
  const [resolvedAddress, setResolvedAddress] = useState<`0x${string}` | null>(null);
  const [token, setToken] = useState<TokenSymbol>("USDC");
  const [chain, setChain] = useState<string>("arc");
  const [amount, setAmount] = useState("");
  const [done, setDone] = useState<string | null>(null);

  const { send, busy: localBusy, confirming: localConfirming, step: localStep, error: localError } = useLocalSend();
  const { sendCrossChain, busy: cctpBusy, confirming: cctpConfirming, step: cctpStep, error: cctpError } = useCctpSend();
  const markFirstActionComplete = useVLiteStore((s) => s.markFirstActionComplete);
  const busy = localBusy || cctpBusy;
  const confirming = localConfirming || cctpConfirming;
  const error = localError || cctpError;

  const decimals = TOKENS[token].decimals;
  const numericAmount = Number(amount) || 0;
  const usdValue = numericAmount * rates.crypto[token];
  const fee = numericAmount * (feeBps / 10_000);
  const netAmount = numericAmount - fee;
  const balance = balances[token] ?? 0;
  const isCrossChain = chain !== "arc";

  const valid = resolvedAddress && numericAmount > 0 && numericAmount <= balance && (!isCrossChain || token === "USDC");

  async function handleSend() {
    if (!valid || !resolvedAddress) return;
    const amountUnits = parseUnits(numericAmount.toFixed(decimals), decimals);
    const feeUnits = parseUnits(fee.toFixed(decimals), decimals);
    const netUnits = amountUnits - feeUnits;
    const shortRecipient = `${resolvedAddress.slice(0, 6)}…${resolvedAddress.slice(-4)}`;

    if (isCrossChain) {
      const chainConfig = CCTP_CHAINS.find((c) => c.key === chain);
      if (!chainConfig?.domain && chainConfig?.domain !== 0) return;
      const hash = await sendCrossChain(netUnits, chainConfig.domain, resolvedAddress, feeUnits);
      if (hash) {
        setDone(hash);
        markFirstActionComplete();
        notify({
          category: "send",
          title: `Cross-chain send submitted (CCTP)`,
          message: `${formatTokenAmount(netAmount, token)} ${token} burned on Arc for minting to ${shortRecipient} on ${chainConfig.label}.`,
          href: "/transfer",
        });
      }
    } else {
      const hash = await send(token, resolvedAddress, netUnits, feeUnits);
      if (hash) {
        setDone(hash);
        markFirstActionComplete();
        notify({
          category: "send",
          title: "Transfer sent",
          message: `${formatTokenAmount(netAmount, token)} ${token} sent to ${shortRecipient} on Arc.`,
          href: "/transfer",
        });
      }
    }
  }

  if (done) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-8 text-center space-y-3">
        <CheckCircle2 className="mx-auto text-success" size={32} />
        <h2 className="font-display text-lg font-semibold">Sent!</h2>
        <p className="text-xs stat-mono text-ink-muted break-all">{done}</p>
        <a
          href={`https://testnet.arcscan.app/tx/${done}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-vlite-purple hover:underline"
        >
          View on Arc Explorer <ExternalLink size={14} />
        </a>
        <button onClick={() => { setDone(null); setAmount(""); setRecipientInput(""); }} className="btn-vlite-secondary mx-auto !py-2 text-sm">
          Send another
        </button>
      </motion.div>
    );
  }

  return (
    <div className="glass-panel p-5 space-y-4">
      <RecipientInput value={recipientInput} onChange={setRecipientInput} onResolvedAddress={setResolvedAddress} />

      <div>
        <label className="text-xs text-ink-muted mb-1.5 block">Token</label>
        <div className="grid grid-cols-3 gap-2">
          {(Object.keys(TOKENS) as TokenSymbol[]).map((t) => (
            <button
              key={t}
              onClick={() => {
                setToken(t);
                if (t !== "USDC") setChain("arc");
              }}
              className={clsx(
                "rounded-xl py-2 text-xs font-semibold transition-colors flex flex-col items-center gap-1",
                token === t ? "bg-vlite-gradient text-white shadow-glow" : "glass-panel-flush text-ink-muted"
              )}
            >
              <TokenIcon symbol={t} size={18} />
              {t}
            </button>
          ))}
        </div>
      </div>

      {token === "USDC" && <ChainSelector value={chain} onChange={setChain} />}

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-ink-muted">Amount</label>
          <button onClick={() => setAmount(String(balance))} className="text-xs font-semibold text-vlite-purple dark:text-vlite-cyan hover:underline">
            Max
          </button>
        </div>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          className="w-full stat-mono text-3xl font-bold bg-transparent outline-none border-b-2 border-white/20 dark:border-white/10 focus:border-vlite-cyan pb-2"
        />
        <p className="text-xs text-ink-muted mt-1.5 stat-mono">
          Balance: {formatTokenAmount(balance, token)} {token} · ≈{usdValue.toLocaleString("en-US", { style: "currency", currency: "USD" })}
        </p>
      </div>

      <div className="rounded-2xl bg-white/40 dark:bg-white/5 p-3 text-sm space-y-1.5">
        <div className="flex justify-between">
          <span className="text-ink-muted">Fee ({(feeBps / 100).toFixed(2)}%)</span>
          <span className="stat-mono">{formatTokenAmount(fee, token)} {token}</span>
        </div>
        <div className="flex justify-between font-semibold">
          <span>Recipient receives</span>
          <span className="stat-mono">{formatTokenAmount(Math.max(netAmount, 0), token)} {token}</span>
        </div>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      {!isCrossChain && localBusy && localStep && (
        <p className="text-xs text-ink-muted text-center -mt-1">
          {localStep === "approve" && "Approve spending — you'll confirm once more to send."}
          {localStep === "send" && "Sending — final confirmation."}
          {localStep === "recipient" && "Step 1 of 2: sending to recipient — you'll confirm once more for the fee."}
          {localStep === "fee" && "Step 2 of 2: sending the fee to complete this transfer."}
        </p>
      )}

      {isCrossChain && cctpBusy && cctpStep && (
        <p className="text-xs text-ink-muted text-center -mt-1">
          {cctpStep === "fee" && "Sending platform fee to treasury — you'll confirm again to bridge."}
          {cctpStep === "approve" && "Approve spending — you'll confirm once more to bridge."}
          {cctpStep === "burn" && "Bridging via CCTP — final confirmation."}
        </p>
      )}

      <button onClick={handleSend} disabled={!valid || busy} className="btn-vlite-primary w-full">
        {confirming
          ? localStep
            ? `Confirming ${localStep === "recipient" ? "transfer" : localStep === "fee" ? "fee" : localStep} on-chain…`
            : cctpStep
              ? `Confirming ${cctpStep === "burn" ? "bridge" : cctpStep} on-chain…`
              : "Confirming on-chain…"
          : busy
            ? isCrossChain
              ? "Bridging via CCTP…"
              : "Sending…"
            : "Send"}
      </button>
    </div>
  );
}
