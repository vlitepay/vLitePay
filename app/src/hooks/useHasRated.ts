"use client";

import { useAccount, useReadContract } from "wagmi";
import { CONTRACTS } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";

export function useHasRated(tradeId: bigint | null) {
  const { address } = useAccount();

  const { data, refetch } = useReadContract({
    address: CONTRACTS.p2pEscrow,
    abi: p2pEscrowAbi,
    functionName: "hasRated",
    args: [tradeId ?? 0n, address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: tradeId != null && !!address && !!CONTRACTS.p2pEscrow },
  });

  return { hasRated: !!data, refetch };
}
