"use client";

import { useReadContract } from "wagmi";
import { CONTRACTS } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";

export function useAirtimeFee() {
  const { data } = useReadContract({
    address: CONTRACTS.p2pEscrow,
    abi: p2pEscrowAbi,
    functionName: "airtimeFeeBps",
    query: { enabled: !!CONTRACTS.p2pEscrow },
  });

  return { feeBps: data ? Number(data) : 75 }; // 0.75% default fallback matches contract default
}
