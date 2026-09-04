"use client";

import { useCallback, useState } from "react";
import { useAccount } from "wagmi";
import type { EIP1193Provider } from "viem";
import { AppKitSwapToken } from "@/lib/constants";
import {
  buildAppKitViemAdapter,
  estimateAppKitSwap,
  executeAppKitSwap,
  AppKitSwapEstimate,
  AppKitSwapResult,
} from "@/lib/appKitSwap";
import { getCircleSession } from "@/lib/circleSession";
import { runCircleSdkChallenge } from "@/lib/circleConnector";
import { describeCircleWriteError } from "@/lib/circleErrors";

/**
 * App Kit Swap is available for any connected wallet now — WalletConnect/
 * injected wallets quote and execute entirely client-side against their
 * own EIP-1193 provider (lib/appKitSwap.ts); Circle Digital Wallets
 * (email/Google) go through /api/swap/estimate + /api/swap/execute, which
 * drive Circle's real user-controlled wallet adapter
 * (@circle-fin/adapter-circle-wallets/ucw/server) server-side and solve
 * the resulting signing challenge through the same SDK PIN/biometric flow
 * Send/P2P already use.
 */
export function useAppKitSwapAvailability() {
  const { isConnected } = useAccount();
  return { available: isConnected };
}

function describeAppKitSwapError(err: unknown): string {
  const base = describeCircleWriteError(err, "Swap couldn't be completed.");
  const lower = base.toLowerCase();
  if (lower.includes("no route") || lower.includes("liquidity") || lower.includes("insufficient")) {
    return "No swap route available right now — Arc Testnet liquidity can be thin. Try again shortly.";
  }
  return base;
}

/** Consumes /api/swap/execute's streamed NDJSON events, solving each Circle signing challenge as it arrives via the existing SDK flow. */
async function runCircleDigitalWalletExecute(body: Record<string, unknown>): Promise<AppKitSwapResult> {
  const res = await fetch("/api/swap/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.error || "Swap couldn't be started.");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: (AppKitSwapResult & { ok?: boolean }) | null = null;
  let streamError: string | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex: number;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;

      const event = JSON.parse(line);
      if (event.type === "challenge" && event.challengeId) {
        // Same Circle SDK PIN/biometric flow Send/P2P use — not a second
        // OTP UI. Solving it lets App Kit's own server-side polling
        // continue and eventually resolve kit.swap().
        await runCircleSdkChallenge(event.challengeId);
      } else if (event.type === "result") {
        finalResult = event;
      } else if (event.type === "error") {
        streamError = event.error || "Swap couldn't be completed.";
      }
    }
  }

  if (streamError) throw new Error(streamError);
  if (!finalResult?.txHash) {
    throw new Error("Swap did not return a transaction hash — treating this as failed, not successful.");
  }
  return finalResult;
}

export function useAppKitSwap() {
  const { connector } = useAccount();
  const isCircleDigitalWallet = connector?.id === "circle-email";

  const [quote, setQuote] = useState<AppKitSwapEstimate | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [swapping, setSwapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AppKitSwapResult | null>(null);

  const getQuote = useCallback(
    async (tokenIn: AppKitSwapToken, tokenOut: AppKitSwapToken, amountDecimal: string) => {
      setError(null);
      setQuote(null);
      setResult(null);
      if (!amountDecimal || Number(amountDecimal) <= 0) return;

      setQuoting(true);
      try {
        if (isCircleDigitalWallet) {
          const session = getCircleSession();
          if (!session) throw new Error("No active Circle session — please sign in again.");
          const res = await fetch("/api/swap/estimate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tokenIn, tokenOut, amountIn: amountDecimal, userToken: session.userToken }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data?.error || "Couldn't get a quote right now.");
          setQuote(data as AppKitSwapEstimate);
        } else {
          if (!connector) throw new Error("Connect a wallet first.");
          const provider = (await connector.getProvider()) as EIP1193Provider;
          const adapter = await buildAppKitViemAdapter(provider);
          const estimate = await estimateAppKitSwap({ adapter, tokenIn, tokenOut, amountIn: amountDecimal });
          setQuote(estimate);
        }
      } catch (err) {
        setError(describeAppKitSwapError(err));
      } finally {
        setQuoting(false);
      }
    },
    [connector, isCircleDigitalWallet]
  );

  const executeSwap = useCallback(
    async (tokenIn: AppKitSwapToken, tokenOut: AppKitSwapToken, amountDecimal: string) => {
      setError(null);
      setSwapping(true);
      try {
        let swapResult: AppKitSwapResult;

        if (isCircleDigitalWallet) {
          const session = getCircleSession();
          if (!session) throw new Error("No active Circle session — please sign in again.");
          swapResult = await runCircleDigitalWalletExecute({
            tokenIn,
            tokenOut,
            amountIn: amountDecimal,
            userToken: session.userToken,
          });
        } else {
          if (!connector) throw new Error("Connect a wallet first.");
          const provider = (await connector.getProvider()) as EIP1193Provider;
          const adapter = await buildAppKitViemAdapter(provider);
          swapResult = await executeAppKitSwap({ adapter, tokenIn, tokenOut, amountIn: amountDecimal });
        }

        // Never declare success without a real transaction hash.
        if (!swapResult?.txHash) {
          setError("Swap did not return a transaction hash — treating this as failed, not successful.");
          return null;
        }

        setResult(swapResult);
        return swapResult;
      } catch (err) {
        setError(describeAppKitSwapError(err));
        return null;
      } finally {
        setSwapping(false);
      }
    },
    [connector, isCircleDigitalWallet]
  );

  const reset = useCallback(() => {
    setQuote(null);
    setResult(null);
    setError(null);
  }, []);

  return { quote, quoting, getQuote, executeSwap, swapping, error, result, reset };
}
