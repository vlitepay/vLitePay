"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { SwappableToken } from "@/lib/constants";

/**
 * Checks GET /api/stablefx/status once on mount. `null` while checking,
 * then `true`/`false`. The Swap tab uses this — not any client-side env
 * var — since STABLEFX_API_KEY is a server secret and can't be read here.
 */
export function useStableFxStatus() {
  const [configured, setConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/stablefx/status")
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setConfigured(!!d.configured);
      })
      .catch(() => {
        if (!cancelled) setConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return configured;
}

export interface StableFxQuote {
  quoteId: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  rate: string;
  feeAmount: string;
  expiresAt: string;
  /** Circle's exact EIP-712 payload for accepting this quote — sign this whole object as-is (see acceptAndSwap below). Never reconstructed client-side. */
  typedData: {
    domain: Record<string, unknown>;
    types: Record<string, unknown>;
    primaryType: string;
    message: Record<string, unknown>;
  };
}

/** Small safety margin so a quote isn't treated as "still valid" a moment before it actually expires on Circle's side. Quotes are documented to expire in ~3-4 seconds. */
const QUOTE_EXPIRY_SAFETY_MS = 1000;

function isQuoteExpired(quote: StableFxQuote): boolean {
  const expiresAtMs = Date.parse(quote.expiresAt);
  if (Number.isNaN(expiresAtMs)) return true;
  return expiresAtMs - QUOTE_EXPIRY_SAFETY_MS <= Date.now();
}

/**
 * Quote + accept for a USDC<->EURC StableFX swap.
 *
 * getQuote() and acceptAndSwap() both hit server routes that 501 outright
 * if StableFX isn't configured — this hook never invents a rate or a
 * txHash locally.
 *
 * Signing: acceptAndSwap() signs `quote.typedData` (domain/types/
 * primaryType/message) EXACTLY as Circle returned it from the quote —
 * never rebuilt client-side. Quotes expire in ~3-4 seconds, so by the time
 * the user reviews the quote and hits confirm it has very likely already
 * expired; acceptAndSwap silently re-fetches a fresh quote (same
 * from/to/amount) right before signing whenever that's the case, so the
 * user doesn't have to manually retry.
 */
export function useStableFxSwap() {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [quote, setQuote] = useState<StableFxQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

  // Remembers the last request's inputs so acceptAndSwap can silently
  // re-quote if the held quote has expired by the time the user confirms.
  const lastRequestRef = useRef<{ fromToken: SwappableToken; toToken: SwappableToken; amountUnits: bigint } | null>(null);

  const requestQuote = useCallback(
    async (fromToken: SwappableToken, toToken: SwappableToken, amountUnits: bigint): Promise<StableFxQuote | null> => {
      const res = await fetch("/api/stablefx/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fromToken, toToken, amount: amountUnits.toString(), walletAddress: address }),
      });
      const data = await res.json();
      if (!res.ok) {
        // Circle's forwarded error body uses `message`, not `error` — see
        // app/api/stablefx/quote's StableFxApiError handling.
        setError(data.error || data.message || "Couldn't get a quote right now.");
        return null;
      }
      return data as StableFxQuote;
    },
    [address]
  );

  const getQuote = useCallback(
    async (fromToken: SwappableToken, toToken: SwappableToken, amountUnits: bigint) => {
      setError(null);
      setQuote(null);
      setTxHash(null);
      if (!address) {
        setError("Connect a wallet first.");
        return;
      }
      if (amountUnits <= 0n) return;

      lastRequestRef.current = { fromToken, toToken, amountUnits };
      setQuoting(true);
      try {
        const fresh = await requestQuote(fromToken, toToken, amountUnits);
        if (fresh) setQuote(fresh);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't get a quote right now.");
      } finally {
        setQuoting(false);
      }
    },
    [address, requestQuote]
  );

  const acceptAndSwap = useCallback(
    async (_fromToken: SwappableToken) => {
      if (!quote || !address) {
        setError("Get a quote first.");
        return null;
      }

      setSwapping(true);
      setError(null);
      try {
        let activeQuote = quote;

        // Quotes expire in ~3-4 seconds — almost always stale by the time
        // the user has reviewed it and clicked confirm. Re-quote silently
        // with the same inputs rather than making the user start over.
        if (isQuoteExpired(activeQuote)) {
          const lastRequest = lastRequestRef.current;
          if (!lastRequest) {
            setError("This quote expired — please get a new quote.");
            return null;
          }
          const fresh = await requestQuote(lastRequest.fromToken, lastRequest.toToken, lastRequest.amountUnits);
          if (!fresh) {
            return null; // requestQuote already set a clear error.
          }
          activeQuote = fresh;
          setQuote(fresh);
        }

        // Sign Circle's typedData EXACTLY as returned — domain, types,
        // primaryType, and message (including the witness) all pass
        // through untouched. Never reconstruct any part of this.
        const { domain, types, primaryType, message } = activeQuote.typedData;
        const signature = await signTypedDataAsync({
          domain: domain as any,
          types: types as any,
          primaryType,
          message: message as any,
        });

        const res = await fetch("/api/stablefx/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quoteId: activeQuote.quoteId,
            address,
            message,
            signature,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || data.message || "Swap couldn't be completed.");
          return null;
        }
        if (data.txHash) setTxHash(data.txHash);
        return data as { status: "settled" | "pending"; txHash?: string };
      } catch (err: any) {
        setError(err?.shortMessage || err?.message || "Swap couldn't be completed.");
        return null;
      } finally {
        setSwapping(false);
      }
    },
    [quote, address, signTypedDataAsync, requestQuote]
  );

  const reset = useCallback(() => {
    setQuote(null);
    setTxHash(null);
    setError(null);
  }, []);

  return { quote, quoting, getQuote, acceptAndSwap, swapping, error, txHash, reset };
}
