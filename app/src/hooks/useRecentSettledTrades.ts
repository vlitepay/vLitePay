"use client";

import { useMemo } from "react";
import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACTS, TRADE_SCAN_LIMIT, TOKENS, TokenSymbol } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";
import { Trade, TradeRating, TradeStatus } from "@/lib/types/p2p";

const symbolByAddress: Record<string, TokenSymbol> = Object.fromEntries(
  (Object.keys(TOKENS) as TokenSymbol[]).map((s) => [TOKENS[s].address.toLowerCase(), s])
);

/**
 * Neither OfferCard's old rating mock nor ActivityFeed's old placeholder
 * rows need to feel instantaneous, and this already does three rounds of
 * multicalls — a longer interval than useOffers.ts's 12s keeps that
 * reasonable.
 */
const POLL_INTERVAL_MS = 30_000;

export interface SettledTrade extends Trade {
  ratings: TradeRating[];
  merchant?: `0x${string}`;
}

export interface MerchantRatingSummary {
  average: number;
  count: number;
}

/**
 * P2PEscrow has no getMerchantRating and no stars on getOffer — ratings
 * live per trade only, via getTradeRatings(tradeId). This replaces both the
 * OfferCard rating mock and the ActivityFeed placeholder with one bounded
 * eth_call-only scan (no eth_getLogs/getContractEvents anywhere here):
 *
 *   1. nextTradeId + getTrade multicall over the last TRADE_SCAN_LIMIT ids
 *      — the exact same pattern useTradeHistory.ts/useDisputedTrades.ts
 *      already use for the same reliability reasons (Arc's public RPC and
 *      eth_getLogs don't mix well) — narrowed to Released/Resolved trades.
 *   2. getTradeRatings multicalled across just that narrowed set.
 *   3. getOffer multicalled across the (deduped) offer ids in that set, to
 *      label which trade participant was the merchant.
 *
 * Meant to be called ONCE per screen (OfferList, ActivityFeed) and the
 * result shared/derived from there — OfferList passes the derived
 * per-merchant summary down to each OfferCard as a prop, the same way it
 * already does for avatars — so a list of many offers/merchants doesn't
 * multiply this scan per card.
 */
export function useRecentSettledTrades() {
  const { data: nextIdData } = useReadContract({
    address: CONTRACTS.p2pEscrow,
    abi: p2pEscrowAbi,
    functionName: "nextTradeId",
    query: { enabled: !!CONTRACTS.p2pEscrow, refetchInterval: POLL_INTERVAL_MS, refetchOnWindowFocus: true },
  });

  const nextId = nextIdData ? Number(nextIdData) : 1;
  const scanFrom = Math.max(1, nextId - TRADE_SCAN_LIMIT);
  const ids = useMemo(() => {
    const arr: number[] = [];
    for (let i = scanFrom; i < nextId; i++) arr.push(i);
    return arr;
  }, [scanFrom, nextId]);

  const { data: tradesData, isLoading, isError } = useReadContracts({
    contracts: ids.map((id) => ({
      address: CONTRACTS.p2pEscrow,
      abi: p2pEscrowAbi,
      functionName: "getTrade" as const,
      args: [BigInt(id)] as const,
    })),
    query: {
      enabled: ids.length > 0 && !!CONTRACTS.p2pEscrow,
      refetchInterval: POLL_INTERVAL_MS,
      refetchOnWindowFocus: true,
    },
  });

  // Ratings and merchant history only ever matter for trades that actually
  // finished — Locked/FiatMarked/Disputed trades can't have been rated yet
  // (rateTrade only makes sense post-settlement) and skipping them keeps
  // the two batches below considerably smaller than the full scan window.
  const settledTrades = useMemo(() => {
    if (!tradesData) return [];
    return tradesData
      .map((r) => (r.status === "success" ? (r.result as any) : null))
      .filter(Boolean)
      .map(
        (t: any): Trade => ({
          ...t,
          tokenSymbol: symbolByAddress[t.token.toLowerCase()] ?? "USDC",
        })
      )
      .filter((t) => t.status === TradeStatus.Released || t.status === TradeStatus.Resolved);
  }, [tradesData]);

  const { data: ratingsData } = useReadContracts({
    contracts: settledTrades.map((t) => ({
      address: CONTRACTS.p2pEscrow,
      abi: p2pEscrowAbi,
      functionName: "getTradeRatings" as const,
      args: [t.id] as const,
    })),
    query: { enabled: settledTrades.length > 0 && !!CONTRACTS.p2pEscrow },
  });

  const offerIds = useMemo(
    () => Array.from(new Set(settledTrades.map((t) => t.offerId.toString()))),
    [settledTrades]
  );

  const { data: offersData } = useReadContracts({
    contracts: offerIds.map((idStr) => ({
      address: CONTRACTS.p2pEscrow,
      abi: p2pEscrowAbi,
      functionName: "getOffer" as const,
      args: [BigInt(idStr)] as const,
    })),
    query: { enabled: offerIds.length > 0 && !!CONTRACTS.p2pEscrow },
  });

  const merchantByOfferId = useMemo(() => {
    const map: Record<string, `0x${string}`> = {};
    offerIds.forEach((idStr, i) => {
      const r = offersData?.[i];
      if (r?.status === "success") map[idStr] = (r.result as any).merchant;
    });
    return map;
  }, [offerIds, offersData]);

  const trades: SettledTrade[] = useMemo(() => {
    return settledTrades
      .map((t, i) => {
        const r = ratingsData?.[i];
        const ratings = r?.status === "success" ? (r.result as TradeRating[]) : [];
        return { ...t, ratings, merchant: merchantByOfferId[t.offerId.toString()] };
      })
      .sort((a, b) => Number(b.lockedAt - a.lockedAt));
  }, [settledTrades, ratingsData, merchantByOfferId]);

  // Ratings a given address RECEIVED (not gave). getTradeRatings only tells
  // us who submitted each rating (`rater`) — the rated party is always the
  // OTHER side of that same trade, so whichever of cryptoBuyer/cryptoSeller
  // isn't the rater is who this star belongs to. Keyed by lowercased
  // address so any offer's `merchant` field can be looked up directly,
  // with no separate per-merchant on-chain call needed.
  const ratingsByAddress = useMemo(() => {
    const map: Record<string, number[]> = {};
    for (const t of trades) {
      for (const r of t.ratings) {
        const rater = r.rater.toLowerCase();
        const ratedParty = rater === t.cryptoBuyer.toLowerCase() ? t.cryptoSeller.toLowerCase() : t.cryptoBuyer.toLowerCase();
        if (!map[ratedParty]) map[ratedParty] = [];
        map[ratedParty].push(r.stars);
      }
    }
    return map;
  }, [trades]);

  function getMerchantRating(address: string): MerchantRatingSummary | null {
    const stars = ratingsByAddress[address.toLowerCase()];
    if (!stars || stars.length === 0) return null;
    return { average: stars.reduce((a, b) => a + b, 0) / stars.length, count: stars.length };
  }

  return { trades, ratingsByAddress, getMerchantRating, isLoading, isError };
}
