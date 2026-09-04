"use client";

import { useState } from "react";
import { useAccount, useReadContract, useWriteContract, usePublicClient } from "wagmi";
import { CONTRACTS, TOKENS } from "@/lib/constants";
import { usernameRegistryAbi } from "@/lib/abi/usernameRegistry";
import { erc20AllowanceAbi } from "@/lib/abi/p2pEscrow";
import { waitForReceiptRobust, ReceiptRevertedError, ReceiptTimeoutError } from "@/lib/waitForReceipt";
import { describeCircleWriteError } from "@/lib/circleErrors";

/** Resolves a username to an address (returns zero address if unregistered). */
export function useResolveUsername(username: string) {
  const enabled = username.length >= 3 && !!CONTRACTS.usernameRegistry;

  return useReadContract({
    address: CONTRACTS.usernameRegistry,
    abi: usernameRegistryAbi,
    functionName: "resolve",
    args: [username],
    query: { enabled },
  });
}

/** Reverse-resolves the connected wallet's own registered username, if any. */
export function useMyUsername() {
  const { address } = useAccount();
  return useUsernameOf(address);
}

/**
 * Reverse-resolves ANY address's registered username, if any — same
 * `reverseResolve` contract call as useMyUsername above, just not limited
 * to the connected wallet. Used to display a merchant's username on offer
 * cards and the header dropdown instead of a truncated address, without
 * touching any contract/ABI/transaction code.
 */
export function useUsernameOf(address: `0x${string}` | undefined | null) {
  return useReadContract({
    address: CONTRACTS.usernameRegistry,
    abi: usernameRegistryAbi,
    functionName: "reverseResolve",
    args: [address ?? "0x0000000000000000000000000000000000000000"],
    query: { enabled: !!address && !!CONTRACTS.usernameRegistry },
  });
}

export function useUsernameActions() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err: any) {
      if (err instanceof ReceiptRevertedError) {
        setError("Transaction reverted on-chain.");
      } else if (err instanceof ReceiptTimeoutError) {
        setError(err.message);
      } else {
        setError(describeCircleWriteError(err, "Transaction failed"));
      }
      return null;
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  /** Confirms `hash` on-chain via the robust poller, toggling `confirming` around the wait. */
  async function confirm(hash: `0x${string}`) {
    setConfirming(true);
    try {
      return await waitForReceiptRobust(publicClient, hash);
    } finally {
      setConfirming(false);
    }
  }

  /** Approves the $1-equivalent USDC registration fee, then registers the username. */
  async function register(username: string, feeAmount: bigint) {
    return run(async () => {
      if (feeAmount > 0n) {
        const approveHash = await writeContractAsync({
          address: TOKENS.USDC.address,
          abi: erc20AllowanceAbi,
          functionName: "approve",
          args: [CONTRACTS.usernameRegistry, feeAmount],
        });
        await confirm(approveHash);
      }

      const hash = await writeContractAsync({
        address: CONTRACTS.usernameRegistry,
        abi: usernameRegistryAbi,
        functionName: "registerUsername",
        args: [username],
      });
      await confirm(hash);
      return hash;
    });
  }

  return { register, busy, confirming, error };
}
