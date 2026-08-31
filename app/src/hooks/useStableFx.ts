"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, useSignTypedData } from "wagmi";
import { arcTestnet, CONTRACTS, SwappableToken, TOKENS } from "@/lib/constants";

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
}

/**
 * Quote + Permit2-signed accept for a USDC<->EURC StableFX swap.
 *
 * getQuote() and acceptAndSwap() both hit server routes that 501 outright
 * if StableFX isn't configured — this hook never invents a rate or a
 * txHash locally. The only thing signed client-side is a standard Permit2
 * `PermitTransferFrom` (the same public EIP-712 primitive Uniswap's
 * Permit2 uses everywhere), authorizing FxEscrow to pull exactly
 * `quote.fromAmount` of `fromToken` — the actual PvP settlement (both legs
 * moving atomically) happens on Circle/FxEscrow's side after accept.
 */
export function useStableFxSwap() {
  const { address } = useAccount();
  const { signTypedDataAsync } = useSignTypedData();

  const [quote, setQuote] = useState<StableFxQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);

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

      setQuoting(true);
      try {
        const res = await fetch("/api/stablefx/quote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromToken, toToken, amount: amountUnits.toString(), walletAddress: address }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Couldn't get a quote right now.");
          return;
        }
        setQuote(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't get a quote right now.");
      } finally {
        setQuoting(false);
      }
    },
    [address]
  );

  const acceptAndSwap = useCallback(
    async (fromToken: SwappableToken) => {
      if (!quote || !address) {
        setError("Get a quote first.");
        return null;
      }
      if (!CONTRACTS.fxEscrow || !CONTRACTS.permit2) {
        setError("Swap settlement isn't configured on this environment yet.");
        return null;
      }

      setSwapping(true);
      setError(null);
      try {
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 10 * 60);
        // Permit2 SignatureTransfer nonces are arbitrary (checked against an
        // on-chain bitmap at redemption, not sequential) — a fresh
        // timestamp+random value is valid. Production should additionally
        // verify this word is unused via Permit2.nonceBitmap() before
        // signing, to avoid a (rare) collision surfacing only at redemption.
        const nonce = (BigInt(Date.now()) << 64n) | BigInt(Math.floor(Math.random() * 1_000_000_000));

        const domain = {
          name: "Permit2",
          chainId: arcTestnet.id,
          verifyingContract: CONTRACTS.permit2,
        } as const;

        const types = {
          TokenPermissions: [
            { name: "token", type: "address" },
            { name: "amount", type: "uint256" },
          ],
          PermitTransferFrom: [
            { name: "permitted", type: "TokenPermissions" },
            { name: "spender", type: "address" },
            { name: "nonce", type: "uint256" },
            { name: "deadline", type: "uint256" },
          ],
        } as const;

        const fromAmount = BigInt(quote.fromAmount);
        const message = {
          permitted: { token: TOKENS[fromToken].address, amount: fromAmount },
          spender: CONTRACTS.fxEscrow,
          nonce,
          deadline,
        };

        const signature = await signTypedDataAsync({
          domain,
          types,
          primaryType: "PermitTransferFrom",
          message,
        });

        const res = await fetch("/api/stablefx/accept", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quoteId: quote.quoteId,
            permit: {
              domain,
              permitted: { token: message.permitted.token, amount: fromAmount.toString() },
              spender: message.spender,
              nonce: nonce.toString(),
              deadline: deadline.toString(),
            },
            signature,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error || "Swap couldn't be completed.");
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
    [quote, address, signTypedDataAsync]
  );

  const reset = useCallback(() => {
    setQuote(null);
    setTxHash(null);
    setError(null);
  }, []);

  return { quote, quoting, getQuote, acceptAndSwap, swapping, error, txHash, reset };
}
