"use client";

import { useReadContracts } from "wagmi";
import { CONTRACTS } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";

/**
 * Reads the current maker (seller/depositor) and taker (buyer) P2P fee rates.
 * Defaults match the contract's constructor values (1% maker / 0% taker) as a
 * fallback while the on-chain read is loading or if the contract isn't
 * configured yet in this environment.
 */
export function useProtocolFee() {
  const { data } = useReadContracts({
    contracts: [
      { address: CONTRACTS.p2pEscrow, abi: p2pEscrowAbi, functionName: "makerFeeBps" },
      { address: CONTRACTS.p2pEscrow, abi: p2pEscrowAbi, functionName: "takerFeeBps" },
    ],
    query: { enabled: !!CONTRACTS.p2pEscrow },
  });

  const makerFeeBps = data?.[0]?.status === "success" ? Number(data[0].result) : 100;
  const takerFeeBps = data?.[1]?.status === "success" ? Number(data[1].result) : 0;

  return { makerFeeBps, takerFeeBps };
}
