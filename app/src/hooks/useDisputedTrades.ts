"use client";

import { useEffect, useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACTS, TRADE_SCAN_LIMIT, TOKENS, TokenSymbol } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";
import { Trade, TradeStatus } from "@/lib/types/p2p";
import { useAdminCacheStore } from "@/store/useAdminCacheStore";

const symbolByAddress: Record<string, TokenSymbol> = Object.fromEntries(
  (Object.keys(TOKENS) as TokenSymbol[]).map((s) => [TOKENS[s].address.toLowerCase(), s])
);

/**
 * An admin sitting on the disputes dashboard has no way to see a NEW
 * dispute someone just raised without reloading — this hook only fetched
 * once. Safe to poll: it already uses the multicall scan pattern
 * (nextTradeId + getTrade), not `eth_getLogs`, so unlike
 * useMerchantApplications.ts (deliberately left unpolled — see that file),
 * there's no unreliable-RPC-call concern here. 15s: admin-only, lower
 * traffic than the public Buy/Sell list, so no need to match useOffers.ts's
 * tighter 12s.
 */
const DISPUTED_TRADES_POLL_INTERVAL_MS = 15_000;

/**
 * RELIABILITY FIX: this previously discovered disputed trades by replaying
 * `DisputeRaised` event logs from block 0 (`getContractEvents` with
 * `fromBlock: 0n`) — the exact `eth_getLogs` pattern that turned out to be
 * the root cause of the P2P fiat-sent/release discovery bug elsewhere in
 * this app (see useTradeHistory.ts). The cache layer added earlier only
 * masks a failure AFTER a first successful load — a brand new admin
 * session with an empty cache would still show "no disputes" on nothing
 * more than a transient RPC error, which is actively dangerous for a
 * dispute dashboard specifically (a real dispute silently disappearing
 * looks identical to it having been resolved).
 *
 * Switched to the same nextTradeId + multicall scan pattern
 * useTradeHistory.ts now uses: read every trade in the last
 * TRADE_SCAN_LIMIT ids and filter client-side for Disputed/Resolved status.
 * No `eth_getLogs` involved at all — the safe-fetch cache stays on top as a
 * second layer, but the underlying discovery itself is now reliable rather
 * than needing the cache to compensate for it.
 */
export function useDisputedTrades() {
  const cachedDisputed = useAdminCacheStore((s) => s.disputedTrades);
  const cachedResolved = useAdminCacheStore((s) => s.resolvedTrades);
  const setCachedDisputedTrades = useAdminCacheStore((s) => s.setDisputedTrades);

  const { data: nextIdData } = useReadContract({
    address: CONTRACTS.p2pEscrow,
    abi: p2pEscrowAbi,
    functionName: "nextTradeId",
    query: {
      enabled: !!CONTRACTS.p2pEscrow,
      refetchInterval: DISPUTED_TRADES_POLL_INTERVAL_MS,
      refetchOnWindowFocus: true,
    },
  });

  const nextId = nextIdData ? Number(nextIdData) : 1;
  const scanFrom = Math.max(1, nextId - TRADE_SCAN_LIMIT);
  const ids = useMemo(() => {
    const arr: number[] = [];
    for (let i = scanFrom; i < nextId; i++) arr.push(i);
    return arr;
  }, [scanFrom, nextId]);

  const { data, isLoading, isError, refetch } = useReadContracts({
    contracts: ids.map((id) => ({
      address: CONTRACTS.p2pEscrow,
      abi: p2pEscrowAbi,
      functionName: "getTrade" as const,
      args: [BigInt(id)] as const,
    })),
    query: {
      enabled: ids.length > 0 && !!CONTRACTS.p2pEscrow,
      refetchInterval: DISPUTED_TRADES_POLL_INTERVAL_MS,
      refetchOnWindowFocus: true,
    },
  });

  const freshAllTrades: Trade[] | null = useMemo(() => {
    if (!data) return null;
    return data
      .map((r) => (r.status === "success" ? (r.result as any) : null))
      .filter(Boolean)
      .map(
        (t: any): Trade => ({
          ...t,
          tokenSymbol: symbolByAddress[t.token.toLowerCase()] ?? "USDC",
        })
      );
  }, [data]);

  const freshTrades = useMemo(
    () => freshAllTrades?.filter((t) => t.status === TradeStatus.Disputed) ?? null,
    [freshAllTrades]
  );
  const freshResolvedTrades = useMemo(
    () => freshAllTrades?.filter((t) => t.status === TradeStatus.Resolved) ?? null,
    [freshAllTrades]
  );

  // Persist only successful reads — this is the entire safe-fetch guarantee.
  useEffect(() => {
    if (freshTrades === null || freshResolvedTrades === null) return;
    setCachedDisputedTrades(freshTrades, freshResolvedTrades);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshTrades, freshResolvedTrades]);

  const trades = freshTrades ?? cachedDisputed;
  const resolvedTrades = freshResolvedTrades ?? cachedResolved;
  const hasCache = cachedDisputed.length > 0 || cachedResolved.length > 0;

  return {
    trades,
    resolvedTrades,
    isLoading: isLoading && !hasCache,
    isError,
    isStale: freshTrades === null && hasCache,
    refetch,
  };
}
