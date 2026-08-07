"use client";

import { useEffect, useState } from "react";
import { usePublicClient, useReadContracts } from "wagmi";
import { CONTRACTS } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";
import { useAdminCacheStore } from "@/store/useAdminCacheStore";
import type { MerchantApplication } from "@/lib/types/p2p";

export type { MerchantApplication };

/**
 * P2PEscrow doesn't keep an enumerable applicant list on-chain, so we replay
 * `MerchantApplied` event logs (cheap on a low-volume testnet) to discover
 * addresses, then cross-check each one's live status. Swap for a subgraph
 * once application volume grows.
 *
 * SAFE-FETCH PATTERN: both the event-log replay and the follow-up status
 * multicall used to reset straight to `[]`/stale-false on any failure,
 * which could make a pending merchant application vanish from the admin
 * queue on nothing more than a transient RPC error. Successful fetches are
 * now persisted (useAdminCacheStore, synced across tabs); a failure keeps
 * showing the last known-good list instead.
 */
export function useMerchantApplications() {
  const publicClient = usePublicClient();
  const [applicants, setApplicants] = useState<`0x${string}`[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logsFailed, setLogsFailed] = useState(false);

  const cached = useAdminCacheStore((s) => s.merchantApplications);
  const setCachedApplications = useAdminCacheStore((s) => s.setMerchantApplications);

  useEffect(() => {
    let cancelled = false;

    async function loadLogs() {
      if (!publicClient || !CONTRACTS.p2pEscrow) return;
      setLoadingLogs(true);
      setLogsFailed(false);
      try {
        const logs = await publicClient.getContractEvents({
          address: CONTRACTS.p2pEscrow,
          abi: p2pEscrowAbi,
          eventName: "MerchantApplied",
          fromBlock: 0n,
          toBlock: "latest",
        });
        const unique = Array.from(new Set(logs.map((l: any) => l.args.applicant as string))) as `0x${string}`[];
        if (!cancelled) setApplicants(unique);
      } catch {
        // Keep whatever applicants we already had — do NOT clear them.
        if (!cancelled) setLogsFailed(true);
      } finally {
        if (!cancelled) setLoadingLogs(false);
      }
    }

    loadLogs();
    return () => {
      cancelled = true;
    };
  }, [publicClient]);

  const { data, isError, refetch } = useReadContracts({
    contracts: applicants.flatMap((addr) => [
      { address: CONTRACTS.p2pEscrow, abi: p2pEscrowAbi, functionName: "isPendingMerchant" as const, args: [addr] },
      { address: CONTRACTS.p2pEscrow, abi: p2pEscrowAbi, functionName: "isApprovedMerchant" as const, args: [addr] },
    ]),
    query: { enabled: applicants.length > 0 },
  });

  const freshApplications: MerchantApplication[] | null =
    applicants.length > 0 && data
      ? applicants.map((address, i) => ({
          address,
          isPending: data[i * 2]?.status === "success" ? (data[i * 2].result as boolean) : false,
          isApproved: data[i * 2 + 1]?.status === "success" ? (data[i * 2 + 1].result as boolean) : false,
        }))
      : null;

  // Persist only successful reads — this is the entire safe-fetch guarantee.
  useEffect(() => {
    if (freshApplications === null) return;
    setCachedApplications(freshApplications);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshApplications]);

  return {
    applications: freshApplications ?? cached,
    isLoading: loadingLogs && cached.length === 0,
    isError: isError || logsFailed,
    isStale: freshApplications === null && cached.length > 0,
    refetch,
  };
}
