"use client";

import { useMemo } from "react";
import { useAccount, useReadContract, useReadContracts } from "wagmi";
import { CONTRACTS, OFFER_SCAN_LIMIT, TOKENS, TokenSymbol } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";
import { Offer } from "@/lib/types/p2p";

const symbolByAddress: Record<string, TokenSymbol> = Object.fromEntries(
  (Object.keys(TOKENS) as TokenSymbol[]).map((s) => [TOKENS[s].address.toLowerCase(), s])
);

export function useMyOffers() {
  const { address } = useAccount();

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

  const { data, isLoading, refetch } = useReadContracts({
    contracts: ids.map((id) => ({
      address: CONTRACTS.p2pEscrow,
      abi: p2pEscrowAbi,
      functionName: "getOffer" as const,
      args: [BigInt(id)] as const,
    })),
    query: { enabled: ids.length > 0 && !!CONTRACTS.p2pEscrow && !!address },
  });

  const offers: Offer[] = useMemo(() => {
    if (!data || !address) return [];
    return data
      .map((result) => (result.status === "success" ? (result.result as any) : null))
      .filter(Boolean)
      .map(
        (o: any): Offer => ({
          ...o,
          tokenSymbol: symbolByAddress[o.token.toLowerCase()] ?? "USDC",
        })
      )
      .filter((o) => o.merchant.toLowerCase() === address.toLowerCase())
      .sort((a, b) => Number(b.createdAt - a.createdAt));
  }, [data, address]);

  return { offers, isLoading, refetch };
}
