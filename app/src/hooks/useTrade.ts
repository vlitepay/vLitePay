"use client";

import { useReadContract, useReadContracts } from "wagmi";
import { CONTRACTS, TOKENS, TokenSymbol } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";
import { Trade, TradeStatus } from "@/lib/types/p2p";

const symbolByAddress: Record<string, TokenSymbol> = Object.fromEntries(
  (Object.keys(TOKENS) as TokenSymbol[]).map((s) => [TOKENS[s].address.toLowerCase(), s])
);

export function useTrade(tradeId: number | null) {
  const enabled = tradeId != null && !!CONTRACTS.p2pEscrow;

  const { data, isLoading, refetch } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi,
        functionName: "getTrade",
        args: [BigInt(tradeId ?? 0)],
      },
      {
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi,
        functionName: "timeRemaining",
        args: [BigInt(tradeId ?? 0)],
      },
    ],
    query: {
      enabled,
      refetchInterval: (query) => {
        // Keep polling while the trade is still active; stop once settled.
        const t = query.state.data?.[0]?.result as any;
        if (!t) return 5000;
        const status = Number(t.status) as TradeStatus;
        const settled = status === TradeStatus.Released || status === TradeStatus.Resolved || status === TradeStatus.Cancelled;
        return settled ? false : 5000;
      },
    },
  });

  const raw = data?.[0]?.status === "success" ? (data[0].result as any) : null;
  const timeRemainingSec = data?.[1]?.status === "success" ? Number(data[1].result as bigint) : 0;

  const trade: Trade | null = raw
    ? {
        id: raw.id,
        offerId: raw.offerId,
        token: raw.token,
        tokenSymbol: symbolByAddress[raw.token.toLowerCase()] ?? "USDC",
        amount: raw.amount,
        makerFeeAmount: raw.makerFeeAmount,
        takerFeeAmount: raw.takerFeeAmount,
        cryptoBuyer: raw.cryptoBuyer,
        cryptoSeller: raw.cryptoSeller,
        fiatAmount: raw.fiatAmount,
        fiatCurrency: raw.fiatCurrency,
        status: Number(raw.status) as TradeStatus,
        lockedAt: raw.lockedAt,
        timerDuration: raw.timerDuration,
        fiatMarkedAt: raw.fiatMarkedAt,
        disputeRaised: raw.disputeRaised,
        evidenceURI: raw.evidenceURI,
      }
    : null;

  return { trade, timeRemainingSec, isLoading, refetch };
}
