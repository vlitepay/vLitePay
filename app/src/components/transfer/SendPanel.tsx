"use client";

import { useEffect, useMemo, useState } from "react";
import { parseUnits } from "viem";
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
import { ReceiptCard } from "@/components/ReceiptCard";
import { fetchCctpMessageStatus, destinationExplorerTxUrl, CCTP_DOMAIN } from "@/lib/cctp";

// Reuses the P2P protocol fee reader's shape — sendFeeBps is a sibling config
// value on the same contract, so we read it directly here for simplicity.
import { useAccount, useReadContract } from "wagmi";
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
  const { address } = useAccount();
  const { balances } = useTokenBalances();
  const { rates } = useExchangeRates();
  const { feeBps } = useSendFee();

  const [recipientInput, setRecipientInput] = useState("");
  const [resolvedAddress, setResolvedAddress] = useState<`0x${string}` | null>(null);
  const [token, setToken] = useState<TokenSymbol>("USDC");
  const [chain, setChain] = useState<string>("arc");
  const [amount, setAmount] = useState("");
  const [receipt, setReceipt] = useState<{
    kind: "local" | "cctp";
    hash: `0x${string}`;
    token: TokenSymbol;
    netAmount: number;
    recipientLabel: string;
    chainLabel?: string;
    destinationDomain?: number;
    usedForwarding?: boolean;
    irisEmpty?: boolean;
  } | null>(null);
  const [mintInfo, setMintInfo] = useState<{ status: "minting" | "minted" | "iris_empty"; destTxHash?: string } | null>(null);

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
  // Local Arc send only — CCTP's cross-chain destination address is on a
  // different chain, so "sending to yourself" isn't the same on-chain
  // concern there and is left untouched.
  const isSelfSend = !isCrossChain && !!resolvedAddress && !!address && resolvedAddress.toLowerCase() === address.toLowerCase();

  const valid = resolvedAddress && numericAmount > 0 && numericAmount <= balance && (!isCrossChain || token === "USDC") && !isSelfSend;

  async function handleSend() {
    if (!valid || !resolvedAddress) return;
    const amountUnits = parseUnits(numericAmount.toFixed(decimals), decimals);
    const feeUnits = parseUnits(fee.toFixed(decimals), decimals);
    const netUnits = amountUnits - feeUnits;
    const shortRecipient = `${resolvedAddress.slice(0, 6)}…${resolvedAddress.slice(-4)}`;
    // Recipient was typed as a username unless it looks like a raw address.
    const recipientLabel = recipientInput.trim().toLowerCase().startsWith("0x") ? shortRecipient : recipientInput.trim();

    if (isCrossChain) {
      const chainConfig = CCTP_CHAINS.find((c) => c.key === chain);
      if (!chainConfig?.domain && chainConfig?.domain !== 0) return;
      const result = await sendCrossChain(netUnits, chainConfig.domain, resolvedAddress, feeUnits);
      if (result) {
        setReceipt({
          kind: "cctp",
          hash: result.hash,
          token,
          netAmount,
          recipientLabel,
          chainLabel: chainConfig.label,
          destinationDomain: result.destinationDomain,
          usedForwarding: result.usedForwarding,
          irisEmpty: result.irisEmpty,
        });
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
        setReceipt({ kind: "local", hash, token, netAmount, recipientLabel });
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

  function resetSend() {
    setReceipt(null);
    setMintInfo(null);
    setAmount("");
    setRecipientInput("");
  }

  // Background mint-completion poll for CCTP receipts — never blocks the
  // receipt from showing green immediately after the burn confirms.
  // "Forwarding" burns just need a status check (Circle mints
  // automatically); the fallback (non-forwarding) path actively relays via
  // /api/cctp/relay, which also returns a real destination tx hash once it
  // succeeds. If Iris had nothing for this burn tx at all, we say so
  // honestly instead of implying a normal pending mint.
  useEffect(() => {
    if (!receipt || receipt.kind !== "cctp" || receipt.destinationDomain === undefined) return;

    let cancelled = false;
    setMintInfo(receipt.irisEmpty ? { status: "iris_empty" } : { status: "minting" });

    async function poll() {
      for (let attempt = 0; attempt < 20 && !cancelled; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 6000));
        if (cancelled) return;

        if (receipt!.usedForwarding) {
          const result = await fetchCctpMessageStatus(CCTP_DOMAIN.arc, receipt!.hash);
          if (cancelled) return;
          if (result.status === "complete") {
            // Circle's Forwarding Service mints automatically — Iris's
            // message-status endpoint doesn't hand back a destination tx
            // hash, so we can confirm minting happened without a specific
            // dest link to show (ReceiptCard falls back to the Arc burn
            // link only, per "Else stay green + Arc burn explorer").
            setMintInfo({ status: "minted" });
            return;
          }
          if (result.status === "iris_empty") setMintInfo({ status: "iris_empty" });
        } else {
          try {
            const res = await fetch("/api/cctp/relay", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ burnTxHash: receipt!.hash, destinationDomain: receipt!.destinationDomain }),
            });
            const data = await res.json().catch(() => ({}));
            if (cancelled) return;
            if (data.status === "minted" || data.status === "already_minted") {
              setMintInfo({ status: "minted", destTxHash: data.destTxHash });
              return;
            }
            if (data.status === "iris_empty") setMintInfo({ status: "iris_empty" });
            if (data.status === "not_configured") return; // nothing will change until env is set — stop polling
          } catch {
            // transient network error — keep polling, same as any other missed attempt
          }
        }
      }
    }

    poll();
    return () => {
      cancelled = true;
    };
  }, [receipt]);

  if (receipt) {
    const isCctp = receipt.kind === "cctp";
    const destTxUrl =
      isCctp && mintInfo?.destTxHash && receipt.destinationDomain !== undefined
        ? destinationExplorerTxUrl(receipt.destinationDomain, mintInfo.destTxHash)
        : null;
    const cctpStatusLabel =
      mintInfo?.status === "minted" ? "Minted" : mintInfo?.status === "iris_empty" ? "Minting… (Iris empty)" : "Minting…";
    const cctpSubtitle =
      mintInfo?.status === "minted"
        ? `Minted on ${receipt.chainLabel}.`
        : mintInfo?.status === "iris_empty"
          ? `Minting on ${receipt.chainLabel} — Circle hasn't reported this burn's status yet.`
          : `Minting on ${receipt.chainLabel}.`;

    return (
      <ReceiptCard
        status="success"
        title="Sent!"
        subtitle={isCctp ? cctpSubtitle : undefined}
        rows={[
          { label: "To", value: receipt.recipientLabel },
          { label: isCctp ? "Net sent" : "Amount", value: `${formatTokenAmount(receipt.netAmount, receipt.token)} ${receipt.token}` },
          ...(isCctp && receipt.chainLabel ? [{ label: "Destination", value: receipt.chainLabel }] : []),
          { label: "Status", value: isCctp ? cctpStatusLabel : "Confirmed" },
        ]}
        explorerUrl={`https://testnet.arcscan.app/tx/${receipt.hash}`}
        explorerLabel={isCctp ? "View burn transaction (Arc)" : "View on Arc Explorer"}
        secondaryExplorerUrl={destTxUrl ?? undefined}
        secondaryExplorerLabel={isCctp && receipt.chainLabel ? `View mint on ${receipt.chainLabel}` : undefined}
        shareTitle="vLitePay transfer"
        shareText={`Sent ${formatTokenAmount(receipt.netAmount, receipt.token)} ${receipt.token} to ${receipt.recipientLabel}${isCctp ? ` on ${receipt.chainLabel}` : ""} via vLitePay`}
        shareUrl={`https://testnet.arcscan.app/tx/${receipt.hash}`}
        onDone={resetSend}
        doneLabel="Send another"
      />
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
      {isSelfSend && <p className="text-sm text-danger">You can't send to yourself.</p>}

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
          {cctpStep === "quote" && "Getting a live bridging quote from Circle…"}
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
