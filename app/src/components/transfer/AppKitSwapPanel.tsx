"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDownUp, CheckCircle2, ExternalLink, Info, Loader2, Share2 } from "lucide-react";
import { APPKIT_SWAP_TOKENS, AppKitSwapToken, TOKENS } from "@/lib/constants";
import { TokenIcon } from "@/components/TokenIcon";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { useAppKitSwap, useAppKitSwapAvailability } from "@/hooks/useAppKitSwap";
import { formatTokenAmount } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { useVLiteStore } from "@/store/useVLiteStore";

/**
 * Circle App Kit Swap (docs: https://docs.arc.network/app-kit/swap) — the
 * default, live Swap rail on Arc Testnet. USDC, EURC, and cirBTC only, no
 * cross-chain this pass, matching Arc Testnet's official supported set.
 *
 * Works for both connection types: WalletConnect/injected wallets quote
 * and execute client-side against their own EIP-1193 provider; Circle
 * Digital Wallets (email/Google) go through /api/swap/estimate +
 * /api/swap/execute, driving Circle's real user-controlled wallet adapter
 * server-side and solving the resulting signing challenge through the
 * same SDK PIN/biometric flow Send/P2P already use (see
 * hooks/useAppKitSwap.ts).
 *
 * Never toasts or shows a success receipt without a real txHash — a
 * successful quote/estimate is not a completed swap.
 */
export function AppKitSwapPanel() {
  const { available } = useAppKitSwapAvailability();
  const { balances, refetch: refetchBalances } = useTokenBalances();
  const { quote, quoting, getQuote, executeSwap, swapping, error, result, reset } = useAppKitSwap();
  const markFirstActionComplete = useVLiteStore((s) => s.markFirstActionComplete);

  const [fromToken, setFromToken] = useState<AppKitSwapToken>("USDC");
  const [toToken, setToToken] = useState<AppKitSwapToken>("EURC");
  const [amount, setAmount] = useState("");

  const decimals = TOKENS[fromToken].decimals;
  const numericAmount = Number(amount) || 0;
  const balance = balances[fromToken] ?? 0;
  const canQuote = available && numericAmount > 0 && numericAmount <= balance;

  const quotedToAmount = useMemo(() => {
    if (!quote?.estimatedOutput) return null;
    return Number(quote.estimatedOutput.amount);
  }, [quote]);

  // Fires only once a real transaction hash exists — a quote or an
  // in-flight swap never triggers this.
  useEffect(() => {
    if (!result) return;
    markFirstActionComplete();
    refetchBalances();
    notify({
      category: "send",
      title: "Swap complete",
      message: `${result.amountIn} ${result.tokenIn} swapped to ${result.amountOut} ${result.tokenOut} via Circle App Kit.`,
      href: "/transfer",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  function selectFromToken(t: AppKitSwapToken) {
    setFromToken(t);
    if (t === toToken) {
      const fallback = APPKIT_SWAP_TOKENS.find((x) => x !== t)!;
      setToToken(fallback);
    }
    setAmount("");
    reset();
  }

  function selectToToken(t: AppKitSwapToken) {
    if (t === fromToken) return;
    setToToken(t);
    reset();
  }

  function flipDirection() {
    const prevFrom = fromToken;
    setFromToken(toToken);
    setToToken(prevFrom);
    setAmount("");
    reset();
  }

  async function handleGetQuote() {
    if (!canQuote) return;
    await getQuote(fromToken, toToken, numericAmount.toFixed(decimals));
  }

  async function handleConfirm() {
    await executeSwap(fromToken, toToken, numericAmount.toFixed(decimals));
  }

  async function handleShare() {
    if (!result) return;
    const text = `Swapped ${result.amountIn} ${result.tokenIn} → ${result.amountOut} ${result.tokenOut} on vLitePay`;
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title: "vLitePay swap", text, url: result.explorerUrl });
        return;
      } catch {
        // User cancelled the native share sheet — fall through to copy.
      }
    }
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(result.explorerUrl);
      notify({ category: "system", title: "Link copied", message: "Explorer link copied to clipboard." });
    }
  }

  // --- Success receipt: only ever reached with a real txHash ---
  if (result) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-8 text-center space-y-3">
        <CheckCircle2 className="mx-auto text-success" size={32} />
        <h2 className="font-display text-lg font-semibold">Swapped!</h2>
        <p className="stat-mono text-lg">
          {result.amountIn} {result.tokenIn}
          {" → "}
          {result.amountOut} {result.tokenOut}
        </p>
        <p className="text-xs stat-mono text-ink-muted break-all">{result.txHash}</p>
        <div className="flex items-center justify-center gap-3">
          <a
            href={result.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-vlite-purple hover:underline"
          >
            View on Arc Explorer <ExternalLink size={14} />
          </a>
          <button onClick={handleShare} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-vlite-purple">
            Share <Share2 size={14} />
          </button>
        </div>
        <button onClick={() => { reset(); setAmount(""); }} className="btn-vlite-secondary mx-auto !py-2 text-sm">
          Swap again
        </button>
      </motion.div>
    );
  }

  // --- In-flight: quoting or swapping ---
  if (swapping) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-8 text-center space-y-3">
        <Loader2 className="mx-auto animate-spin text-vlite-cyan" size={32} />
        <h2 className="font-display text-lg font-semibold">Confirming swap</h2>
        <p className="text-sm text-ink-muted">Approve the request in your wallet, then wait for it to confirm on-chain.</p>
        {error && <p className="text-sm text-danger">{error}</p>}
        {error && (
          <button onClick={() => reset()} className="btn-vlite-secondary mx-auto !py-2 text-sm">
            Start over
          </button>
        )}
      </motion.div>
    );
  }

  return (
    <div className="glass-panel p-5 space-y-4">
      <p className="text-xs text-ink-muted -mt-1">Powered by Circle App Kit</p>

      {!available && (
        <div className="rounded-2xl bg-white/40 dark:bg-white/5 p-3 text-sm flex gap-2 items-start">
          <Info size={16} className="shrink-0 mt-0.5 text-ink-muted" />
          <p className="text-ink-muted">Connect a wallet to swap.</p>
        </div>
      )}

      <div>
        <label className="text-xs text-ink-muted mb-1.5 block">You pay</label>
        <div className="grid grid-cols-3 gap-2">
          {APPKIT_SWAP_TOKENS.map((t) => (
            <button
              key={t}
              onClick={() => selectFromToken(t)}
              className={
                "rounded-xl py-2 text-xs font-semibold transition-colors flex flex-col items-center gap-1 " +
                (fromToken === t ? "bg-vlite-gradient text-white shadow-glow" : "glass-panel-flush text-ink-muted")
              }
            >
              <TokenIcon symbol={t} size={18} />
              {t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-xs text-ink-muted">Amount</label>
          <button
            onClick={() => {
              setAmount(String(balance));
              reset();
            }}
            className="text-xs font-semibold text-vlite-purple dark:text-vlite-cyan hover:underline"
          >
            Max
          </button>
        </div>
        <input
          type="number"
          value={amount}
          onChange={(e) => {
            setAmount(e.target.value);
            reset();
          }}
          disabled={!available}
          placeholder="0.00"
          className="w-full stat-mono text-3xl font-bold bg-transparent outline-none border-b-2 border-white/20 dark:border-white/10 focus:border-vlite-cyan pb-2 disabled:opacity-50"
        />
        <p className="text-xs text-ink-muted mt-1.5 stat-mono">
          Balance: {formatTokenAmount(balance, fromToken)} {fromToken}
        </p>
      </div>

      <div className="flex justify-center">
        <button
          onClick={flipDirection}
          className="glass-panel-flush rounded-full p-2 text-ink-muted hover:text-vlite-purple transition-colors"
          aria-label="Flip swap direction"
        >
          <ArrowDownUp size={16} />
        </button>
      </div>

      <div>
        <label className="text-xs text-ink-muted mb-1.5 block">You receive</label>
        <div className="grid grid-cols-3 gap-2 mb-2">
          {APPKIT_SWAP_TOKENS.map((t) => (
            <button
              key={t}
              onClick={() => selectToToken(t)}
              disabled={t === fromToken}
              className={
                "rounded-xl py-2 text-xs font-semibold transition-colors flex flex-col items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed " +
                (toToken === t ? "bg-vlite-gradient text-white shadow-glow" : "glass-panel-flush text-ink-muted")
              }
            >
              <TokenIcon symbol={t} size={18} />
              {t}
            </button>
          ))}
        </div>
        <div className="rounded-2xl bg-white/40 dark:bg-white/5 p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TokenIcon symbol={toToken} size={22} />
            <span className="font-semibold">{toToken}</span>
          </div>
          <span className="stat-mono text-lg">
            {quotedToAmount !== null ? formatTokenAmount(quotedToAmount, toToken) : "—"}
          </span>
        </div>
      </div>

      {quote && (
        <div className="rounded-2xl bg-white/40 dark:bg-white/5 p-3 text-sm space-y-1.5">
          <div className="flex justify-between">
            <span className="text-ink-muted">Minimum received</span>
            <span className="stat-mono">
              {quote.stopLimit.amount} {quote.stopLimit.token}
            </span>
          </div>
          {quote.fees.map((fee, i) => (
            <div className="flex justify-between" key={i}>
              <span className="text-ink-muted capitalize">{fee.type} fee</span>
              <span className="stat-mono">
                {fee.amount} {fee.token}
              </span>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {!quote ? (
        <button onClick={handleGetQuote} disabled={!canQuote || quoting} className="btn-vlite-primary w-full">
          {quoting ? "Getting quote…" : "Get quote"}
        </button>
      ) : (
        <button onClick={handleConfirm} disabled={swapping} className="btn-vlite-primary w-full">
          Confirm swap
        </button>
      )}
    </div>
  );
}
