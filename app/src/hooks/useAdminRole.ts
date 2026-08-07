"use client";

import { keccak256, toBytes } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { CONTRACTS } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";

// Matches `keccak256("OWNER_ROLE")` / `keccak256("ARBITER_ROLE")` in P2PEscrow.sol.
const OWNER_ROLE = keccak256(toBytes("OWNER_ROLE"));
const ARBITER_ROLE = keccak256(toBytes("ARBITER_ROLE"));

export function useAdminRole() {
  const { address } = useAccount();

  const { data, isLoading } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi,
        functionName: "hasRole",
        args: [OWNER_ROLE, address ?? "0x0000000000000000000000000000000000000000"],
      },
      {
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi,
        functionName: "hasRole",
        args: [ARBITER_ROLE, address ?? "0x0000000000000000000000000000000000000000"],
      },
    ],
    query: { enabled: !!address && !!CONTRACTS.p2pEscrow },
  });

  const isOwner = data?.[0]?.status === "success" ? (data[0].result as boolean) : false;
  const isArbiter = data?.[1]?.status === "success" ? (data[1].result as boolean) : false;

  return { isOwner, isArbiter, isLoading, canAccessAdmin: isOwner || isArbiter };
}
