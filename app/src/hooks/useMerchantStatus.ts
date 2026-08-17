"use client";

import { useEffect } from "react";
import { useAccount, useReadContracts } from "wagmi";
import { CONTRACTS } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";
import { notify } from "@/lib/notify";
import { useMerchantApprovalNotifiedStore } from "@/store/useMerchantApprovalNotifiedStore";

export function useMerchantStatus() {
  const { address } = useAccount();
  const wasNotified = useMerchantApprovalNotifiedStore((s) => s.wasNotified);
  const markNotified = useMerchantApprovalNotifiedStore((s) => s.markNotified);

  const { data, refetch, isLoading } = useReadContracts({
    contracts: [
      {
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi,
        functionName: "isApprovedMerchant",
        args: [address ?? "0x0000000000000000000000000000000000000000"],
      },
      {
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi,
        functionName: "isPendingMerchant",
        args: [address ?? "0x0000000000000000000000000000000000000000"],
      },
    ],
    query: {
      enabled: !!address && !!CONTRACTS.p2pEscrow,
      refetchOnWindowFocus: true,
      // A user sitting on the "Application pending" screen (MyShop) has no
      // other way to learn an admin approved them short of a manual reload
      // — same rationale as useTrade.ts's conditional polling. Poll only
      // while pending; approved is a stable end state (matches "settled"
      // in useTrade), so stop once reached rather than polling forever for
      // every already-approved merchant visiting MyShop.
      refetchInterval: (query) => {
        const approved = query.state.data?.[0]?.result as boolean | undefined;
        const pending = query.state.data?.[1]?.result as boolean | undefined;
        return pending && !approved ? 15_000 : false;
      },
    },
  });

  const isApproved = data?.[0]?.status === "success" ? (data[0].result as boolean) : false;
  const isPending = data?.[1]?.status === "success" ? (data[1].result as boolean) : false;

  // One-time notification the first time this address is seen as approved —
  // persisted so it survives remounts/navigation and only ever fires once.
  useEffect(() => {
    if (isApproved && address && !wasNotified(address)) {
      markNotified(address);
      notify({
        category: "merchant",
        title: "Merchant application approved! 🎉",
        message: "You're now an approved vLitePay merchant — open MyShop to post your first offer.",
        href: "/p2p/myshop",
      });
    }
  }, [isApproved, address]); // eslint-disable-line react-hooks/exhaustive-deps

  return { isApproved, isPending, isLoading, refetch };
}
