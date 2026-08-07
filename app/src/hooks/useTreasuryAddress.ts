"use client";

import { useReadContract } from "wagmi";
import { CONTRACTS } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";

export function useTreasuryAddress() {
  const { data } = useReadContract({
    address: CONTRACTS.p2pEscrow,
    abi: p2pEscrowAbi,
    functionName: "treasury",
    query: { enabled: !!CONTRACTS.p2pEscrow },
  });

  return { treasury: data as `0x${string}` | undefined };
}
