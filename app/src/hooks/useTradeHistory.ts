"use client";

import { useEffect, useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACTS, TRADE_SCAN_LIMIT, TOKENS, TokenSymbol } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";
import { Trade } from "@/lib/types/p2p";
import { useTradeHistoryCacheStore } from "@/store/useTradeHistoryCacheStore";

const symbolByAddress: Record<string, TokenSymbol> = Object.fromEntries(
  (Object.keys(TOKENS) as TokenSymbol[]).map((s) => [TOKENS[s].address.toLowerCase(), s])
);

/**
 * P2PEscrow doesn't keep a per-user trade index on-chain. This previously
 * replayed `TradeLocked` event logs from block 0 (`getContractEvents` with
 * `fromBlock: 0n`) to find every trade id — exactly the kind of `eth_getLogs`
 * call Arc's public testnet RPC has repeatedly proven unreliable with (see
 * the arcTestnet chain comment and the /api/rpc proxy elsewhere in this
 * codebase). When that log fetch failed, this hook silently returned an
 * empty trade list.
 *
 * That silent-empty failure is what broke the fiat-sent → release flow for
 * one side of every trade: ActiveTradeBanner.tsx's auto-discovery of "a
 * trade this wallet is party to" depends entirely on this hook. The taker
 * who calls acceptOffer gets their own `activeTradeId` set directly (in
 * app/p2p/trade/[id]/page.tsx, on their own visit) — so their session
 * always worked. The merchant, who never personally triggers any
 * transaction to get there, relies ENTIRELY on this hook finding their
 * trade — so whenever the log replay failed for their session specifically,
 * they'd never see the banner, never open the trade page, and it would
 * look exactly like "the button never appears" or "the merchant is never
 * prompted" — because they never got to the page that has it.
 *
 * Fixed the same way useOffers.ts already reliably browses offers: read
 * `nextTradeId`, then multicall `getTrade` across the last
 * TRADE_SCAN_LIMIT ids and filter client-side — no `eth_getLogs` involved
 * at all. On top of that, a successful scan is cached (last-known-good,
 * same pattern as useBalanceCacheStore/useOffersCacheStore) so a
 * transient failure keeps showing the last good list instead of an empty
 * one, rather than just being less likely to fail.
 */
export function useTradeHistory(address: `0x${string}` | undefined) {
  const cached = useTradeHistoryCacheStore((s) => s.getTrades(address));
  const setCachedTrades = useTradeHistoryCacheStore((s) => s.setTrades);

  const { data: nextIdData } = useReadContract({
    address: CONTRACTS.p2pEscrow,
    abi: p2pEscrowAbi,
    functionName: "nextTradeId",
    query: { enabled: !!CONTRACTS.p2pEscrow },
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
    query: { enabled: ids.length > 0 && !!CONTRACTS.p2pEscrow && !!address },
  });

  // `null` while the multicall hasn't resolved (or failed) at all yet — in
  // either case we must NOT treat that as "this wallet has no trades".
  const freshTrades: Trade[] | null = useMemo(() => {
    if (!data || !address) return null;
    return data
      .map((r) => (r.status === "success" ? (r.result as any) : null))
      .filter(Boolean)
      .map(
        (t: any): Trade => ({
          ...t,
          tokenSymbol: symbolByAddress[t.token.toLowerCase()] ?? "USDC",
        })
      )
      .filter(
        (t) =>
          t.cryptoBuyer.toLowerCase() === address.toLowerCase() || t.cryptoSeller.toLowerCase() === address.toLowerCase()
      )
      .sort((a, b) => Number(b.lockedAt - a.lockedAt));
  }, [data, address]);

  // Persist only successful scans — this is the entire safe-fetch guarantee.
  useEffect(() => {
    if (freshTrades === null || !address) return;
    setCachedTrades(address, freshTrades);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address, freshTrades]);

  const trades = freshTrades ?? cached?.trades ?? [];
  const isStale = freshTrades === null && !!cached;

  return {
    trades,
    isLoading: isLoading && !cached,
    isError,
    isStale,
    refetch,
  };
}
