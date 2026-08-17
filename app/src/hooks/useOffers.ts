"use client";

import { useEffect, useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACTS, OFFER_SCAN_LIMIT, TOKENS, TokenSymbol } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";
import { Offer, OfferSide } from "@/lib/types/p2p";
import { useOffersCacheStore } from "@/store/useOffersCacheStore";

const symbolByAddress: Record<string, TokenSymbol> = Object.fromEntries(
  (Object.keys(TOKENS) as TokenSymbol[]).map((s) => [TOKENS[s].address.toLowerCase(), s])
);

/**
 * How often the Buy/Sell offer list re-checks the chain while the P2P page
 * is open, in addition to refetching on window focus. Buyers/sellers
 * currently have to hard-refresh to see offers another merchant just
 * posted/edited/paused — this closes that gap without adding an indexer or
 * realtime infra. 12s is a deliberate middle ground: frequent enough that
 * the list feels live, infrequent enough not to hammer the RPC endpoint.
 *
 * Note: components/Providers.tsx sets `refetchOnWindowFocus: false` and a
 * 30s `staleTime` as the GLOBAL react-query default (correct for most
 * reads — balances, trade history, etc. don't need to poll). The `query`
 * options below override both, but only for this hook's two reads — every
 * other query in the app keeps the existing global behavior unchanged.
 */
const OFFERS_POLL_INTERVAL_MS = 12_000;

/**
 * Browses P2P offers for a token/fiat/side combination.
 *
 * NOTE: P2PEscrow doesn't expose an enumerable offer list on-chain (only a
 * `nextOfferId` counter + per-id mapping), so for testnet scale we multicall
 * `getOffer` across ids 1..nextOfferId-1 and filter client-side. Swap this
 * for a subgraph/indexer once offer volume grows past a few hundred.
 *
 * SAFE-FETCH PATTERN: this used to return `[]` whenever `data` was
 * undefined — true both while genuinely loading AND after a failed
 * multicall, so a transient RPC hiccup made a real offer list flash to
 * "No offers for this pair yet". Successful reads are now persisted
 * (useOffersCacheStore, synced across tabs); a failed or in-flight read
 * falls back to the last cached list for this exact token/fiat/side
 * combination instead of an empty array.
 */
export function useOffers(tokenSymbol: TokenSymbol, fiatCode: string, side: OfferSide) {
  const cacheKey = `${tokenSymbol}:${fiatCode}:${side}`;
  const cached = useOffersCacheStore((s) => s.getOffers(cacheKey));
  const setCachedOffers = useOffersCacheStore((s) => s.setOffers);

  const { data: nextIdData } = useReadContract({
    address: CONTRACTS.p2pEscrow,
    abi: p2pEscrowAbi,
    functionName: "nextOfferId",
    query: {
      enabled: !!CONTRACTS.p2pEscrow,
      refetchInterval: OFFERS_POLL_INTERVAL_MS,
      refetchOnWindowFocus: true,
    },
  });

  const nextId = nextIdData ? Number(nextIdData) : 1;
  const scanFrom = Math.max(1, nextId - OFFER_SCAN_LIMIT);
  const ids = useMemo(() => {
    const arr: number[] = [];
    for (let i = scanFrom; i < nextId; i++) arr.push(i);
    return arr;
  }, [scanFrom, nextId]);

  const { data, isLoading, isError, refetch } = useReadContracts({
    contracts: ids.map((id) => ({
      address: CONTRACTS.p2pEscrow,
      abi: p2pEscrowAbi,
      functionName: "getOffer" as const,
      args: [BigInt(id)] as const,
    })),
    query: {
      enabled: ids.length > 0 && !!CONTRACTS.p2pEscrow,
      refetchInterval: OFFERS_POLL_INTERVAL_MS,
      refetchOnWindowFocus: true,
    },
  });

  // `undefined` when the multicall hasn't resolved (or failed) at all yet —
  // in either case we must NOT treat that as "zero offers exist".
  //
  // There's a second, less obvious failure mode this also has to catch:
  // wagmi's multicall wraps each individual `getOffer` call with
  // allowFailure, so a bad-network condition (timeouts, dropped RPC
  // responses) commonly resolves the QUERY successfully while every
  // individual call inside it failed — `data` is a defined array, just one
  // where nothing has `status === "success"`. Without checking for that,
  // this filtered down to a legitimate-looking `[]`, which then overwrote
  // the cache below and made a real offer list vanish on a network blip
  // rather than staying on the last-known-good list. Genuinely zero
  // matching offers (fetch succeeded, nothing matched this token/fiat/side)
  // is unaffected — that path still requires at least one call to have
  // actually succeeded.
  const freshOffers: Offer[] | null = useMemo(() => {
    if (!data) return null;
    if (ids.length > 0 && !data.some((r) => r.status === "success")) return null;

    return data
      .map((result) => (result.status === "success" ? (result.result as any) : null))
      .filter(Boolean)
      .map(
        (o: any): Offer => ({
          id: o.id,
          merchant: o.merchant,
          side: o.side as OfferSide,
          token: o.token,
          tokenSymbol: symbolByAddress[o.token.toLowerCase()] ?? "USDC",
          fiatCurrency: o.fiatCurrency,
          rate: o.rate,
          minAmount: o.minAmount,
          maxAmount: o.maxAmount,
          terms: o.terms,
          active: o.active,
          paused: o.paused,
          views: o.views,
          tradesCount: o.tradesCount,
          volume: o.volume,
          createdAt: o.createdAt,
        })
      )
      .filter(
        (o) =>
          o.active &&
          !o.paused &&
          o.tokenSymbol === tokenSymbol &&
          o.fiatCurrency === fiatCode &&
          o.side === side
      )
      .sort((a, b) => Number(b.volume - a.volume)); // most active merchants surface first
  }, [data, ids, tokenSymbol, fiatCode, side]);

  // Persist only successful reads — this is the entire safe-fetch guarantee.
  useEffect(() => {
    if (freshOffers === null) return;
    setCachedOffers(cacheKey, freshOffers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey, freshOffers]);

  const offers = freshOffers ?? cached?.offers ?? [];
  const isStale = freshOffers === null && !!cached;

  return {
    offers,
    isLoading: isLoading && !cached,
    isError,
    isStale,
    refetch,
  };
}
