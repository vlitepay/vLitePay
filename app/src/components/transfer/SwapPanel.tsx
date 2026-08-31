"use client";

import { useMemo, useState } from "react";
import { parseUnits } from "viem";
import { motion } from "framer-motion";
import { ArrowDownUp, CheckCircle2, ExternalLink, Info } from "lucide-react";
import { SWAPPABLE_TOKENS, SwappableToken, TOKENS } from "@/lib/constants";
import { TokenIcon } from "@/components/TokenIcon";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { useStableFxStatus, useStableFxSwap } from "@/hooks/useStableFx";
import { formatTokenAmount } from "@/lib/utils";
import { notify } from "@/lib/notify";
import { useVLiteStore } from "@/store/useVLiteStore";

/**
 * v1: USDC <-> EURC only, via Circle StableFX (off-chain RFQ quote, on-chain
 * PvP settlement through FxEscrow + a Permit2 signature — see
 * hooks/useStableFx.ts). cirBTC is intentionally not offered here.
 *
 * Never fakes a rate or lets a swap "execute" without live config: while
 * GET /api/stablefx/status hasn't confirmed StableFX is configured, the
 * whole form is disabled with explanatory copy instead of a quote button.
 */
export function SwapPanel() {
  const configured = useStableFxStatus();
  const { balances } = useTokenBalances();
  const { quote, quoting, getQuote, acceptAndSwap, swapping, error, txHash, reset } = useStableFxSwap();
  const markFirstActionComplete = useVLiteStore((s) => s.markFirstActionComplete);

  const [fromToken, setFromToken] = useState<SwappableToken>("USDC");
  const toToken: SwappableToken = fromToken === "USDC" ? "EURC" : "USDC";
  const [amount, setAmount] = useState("");

  const decimals = TOKENS[fromToken].decimals;
  const numericAmount = Number(amount) || 0;
  const balance = balances[fromToken] ?? 0;
  const canQuote = configured === true && numericAmount > 0 && numericAmount <= balance;

  const quotedToAmount = useMemo(() => {
    if (!quote) return null;
    return Number(quote.toAmount) / 10 ** TOKENS[toToken].decimals;
  }, [quote, toToken]);

  function flipDirection() {
    setFromToken(toToken);
    setAmount("");
    reset();
  }

  async function handleGetQuote() {
    if (!canQuote) return;
    const units = parseUnits(numericAmount.toFixed(decimals), decimals);
    await getQuote(fromToken, toToken, units);
  }

  async function handleConfirm() {
    const result = await acceptAndSwap(fromToken);
    if (result?.txHash) {
      markFirstActionComplete();
      notify({
        category: "send",
        title: "Swap settled",
        message: `${formatTokenAmount(numericAmount, fromToken)} ${fromToken} swapped to ${toToken} via StableFX.`,
        href: "/transfer",
      });
    }
  }

  if (txHash) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-8 text-center space-y-3">
        <CheckCircle2 className="mx-auto text-success" size={32} />
        <h2 className="font-display text-lg font-semibold">Swapped!</h2>
        <p className="text-xs stat-mono text-ink-muted break-all">{txHash}</p>
        <a
          href={`https://testnet.arcscan.app/tx/${txHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-vlite-purple hover:underline"
        >
          View on Arc Explorer <ExternalLink size={14} />
        </a>
        <button onClick={() => { reset(); setAmount(""); }} className="btn-vlite-secondary mx-auto !py-2 text-sm">
          Swap again
        </button>
      </motion.div>
    );
  }

  return (
    <div className="glass-panel p-5 space-y-4">
      {configured === false && (
        <div className="rounded-2xl bg-white/40 dark:bg-white/5 p-3 text-sm flex gap-2 items-start">
          <Info size={16} className="shrink-0 mt-0.5 text-ink-muted" />
          <p className="text-ink-muted">
            Swap isn't live on this environment yet — StableFX API keys aren't configured. Quoting and
            confirming are disabled below; nothing here uses a placeholder rate.
          </p>
        </div>
      )}

      <div>
        <label className="text-xs text-ink-muted mb-1.5 block">You pay</label>
        <div className="grid grid-cols-2 gap-2">
          {SWAPPABLE_TOKENS.map((t) => (
            <button
              key={t}
              onClick={() => {
                setFromToken(t);
                setAmount("");
                reset();
              }}
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
          disabled={configured !== true}
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
            <span className="text-ink-muted">Rate</span>
            <span className="stat-mono">
              1 {fromToken} = {quote.rate} {toToken}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">Fee</span>
            <span className="stat-mono">
              {formatTokenAmount(Number(quote.feeAmount) / 10 ** decimals, fromToken)} {fromToken}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">Quote expires</span>
            <span className="stat-mono">{new Date(quote.expiresAt).toLocaleTimeString()}</span>
          </div>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      {!quote ? (
        <button onClick={handleGetQuote} disabled={!canQuote || quoting} className="btn-vlite-primary w-full">
          {configured === null ? "Checking Swap availability…" : quoting ? "Getting quote…" : "Get quote"}
        </button>
      ) : (
        <button onClick={handleConfirm} disabled={swapping} className="btn-vlite-primary w-full">
          {swapping ? "Confirming swap…" : "Confirm swap"}
        </button>
      )}
    </div>
  );
}
