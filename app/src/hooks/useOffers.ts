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
    query: { enabled: !!CONTRACTS.p2pEscrow },
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
    query: { enabled: ids.length > 0 && !!CONTRACTS.p2pEscrow },
  });

  // `undefined` when the multicall hasn't resolved (or failed) at all yet —
  // in either case we must NOT treat that as "zero offers exist".
  const freshOffers: Offer[] | null = useMemo(() => {
    if (!data) return null;
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
  }, [data, tokenSymbol, fiatCode, side]);

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
