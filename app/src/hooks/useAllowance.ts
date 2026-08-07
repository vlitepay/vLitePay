"use client";

import { useAccount, useReadContract } from "wagmi";
import { CONTRACTS, TOKENS, TokenSymbol } from "@/lib/constants";
import { erc20AllowanceAbi } from "@/lib/abi/p2pEscrow";

export function useAllowance(tokenSymbol: TokenSymbol) {
  const { address } = useAccount();

  const { data, refetch } = useReadContract({
    address: TOKENS[tokenSymbol].address,
    abi: erc20AllowanceAbi,
    functionName: "allowance",
    args: [address ?? "0x0000000000000000000000000000000000000000", CONTRACTS.p2pEscrow],
    query: { enabled: !!address && !!CONTRACTS.p2pEscrow },
  });

  return { allowance: (data as bigint | undefined) ?? 0n, refetch };
}
