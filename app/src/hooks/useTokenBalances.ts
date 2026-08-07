"use client";

import { useEffect } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { formatUnits } from "viem";
import { TOKENS, TokenSymbol } from "@/lib/constants";
import { useBalanceCacheStore } from "@/store/useBalanceCacheStore";

const erc20Abi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export type TokenReadStatus = "idle" | "loading" | "success" | "error" | "stale";

/**
 * Reads on-chain ERC20 balances for USDC, EURC, and cirBTC on Arc, using each
 * token's own decimals from `TOKENS` (USDC 6, EURC 6, cirBTC 8) — verified
 * against the addresses given in the project brief.
 *
 * SAFE-FETCH PATTERN: a failed/reverted `balanceOf` call used to fall back
 * to a bare `0`, indistinguishable from a wallet that genuinely has no
 * balance. Combined with Arc's public testnet RPC being documented to
 * rate-limit under polling load, this meant a real balance could visibly
 * "reset to 0" on nothing more than a transient read failure — worse for
 * injected wallets like MetaMask, which tend to fire reads more eagerly on
 * focus/reconnect. Per-token balances are now persisted (useBalanceCacheStore,
 * synced across tabs) the moment a read succeeds; on failure, the LAST
 * cached good value is returned instead of 0, tagged "stale" rather than
 * silently indistinguishable from a real zero balance.
 */
export function useTokenBalances() {
  const { address, isConnected } = useAccount();
  const symbols = Object.keys(TOKENS) as TokenSymbol[];
  const cached = useBalanceCacheStore((s) => s.getBalances(address));
  const setCachedBalances = useBalanceCacheStore((s) => s.setBalances);

  const { data, isLoading, isError, error, refetch } = useReadContracts({
    contracts: symbols.map((symbol) => ({
      address: TOKENS[symbol].address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address ?? "0x0000000000000000000000000000000000000000"],
    })),
    query: { enabled: isConnected && !!address },
  });

  const balances: Record<TokenSymbol, number> = {
    USDC: cached?.balances.USDC ?? 0,
    EURC: cached?.balances.EURC ?? 0,
    cirBTC: cached?.balances.cirBTC ?? 0,
  };
  const statuses: Record<TokenSymbol, TokenReadStatus> = { USDC: "idle", EURC: "idle", cirBTC: "idle" };
  const errors: Record<TokenSymbol, string | null> = { USDC: null, EURC: null, cirBTC: null };

  const freshBalances: Partial<Record<TokenSymbol, number>> = {};

  data?.forEach((result, i) => {
    const symbol = symbols[i];
    if (result.status === "success") {
      const value = Number(formatUnits(result.result as bigint, TOKENS[symbol].decimals));
      balances[symbol] = value;
      freshBalances[symbol] = value;
      statuses[symbol] = "success";
    } else {
      // Read failed: keep whatever was already in `balances` above (the
      // last cached good value, or 0 only if we've genuinely never had one)
      // instead of overwriting it with 0.
      statuses[symbol] = cached ? "stale" : "error";
      errors[symbol] = result.error?.message ?? "balanceOf call failed";
    }
  });

  // Persist successful reads (only successful ones — this is the entire
  // safe-fetch guarantee) so this address's balances survive a later
  // failed fetch, a page reload, or being read from a different tab.
  useEffect(() => {
    if (!address || Object.keys(freshBalances).length === 0) return;
    setCachedBalances(address, { ...balances, ...freshBalances } as Record<TokenSymbol, number>);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, JSON.stringify(freshBalances)]);

  // Surface read failures in the console during development instead of
  // letting them silently render as an indistinguishable "0" balance.
  useEffect(() => {
    if (!data) return;
    for (const symbol of symbols) {
      if (statuses[symbol] === "error" || statuses[symbol] === "stale") {
        console.warn(
          `[useTokenBalances] ${symbol} balanceOf failed at ${TOKENS[symbol].address} — showing ${
            statuses[symbol] === "stale" ? "the last known good balance" : "0 (no cached balance available yet)"
          }, not necessarily the current on-chain balance. Arc's public testnet RPC is documented to rate-limit (HTTP 429) ` +
            `under polling load, which is the most common cause of one token failing while others succeed — try again ` +
            `in a moment, or switch NEXT_PUBLIC_ARC_RPC_URL to a dedicated provider if this persists. Raw error: ${errors[symbol]}`
        );
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return {
    balances,
    statuses,
    errors,
    isLoading: isLoading && !cached, // don't show a loading state if we already have cached data to show
    isError,
    queryError: error,
    refetch,
    isConnected,
  };
}
