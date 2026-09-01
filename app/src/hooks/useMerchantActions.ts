"use client";

import { useState } from "react";
import { useWriteContract, usePublicClient } from "wagmi";
import { CONTRACTS } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";
import { OfferSide } from "@/lib/types/p2p";
import { waitForReceiptRobust, ReceiptRevertedError, ReceiptTimeoutError } from "@/lib/waitForReceipt";
import { describeCircleWriteError } from "@/lib/circleErrors";

export function useMerchantActions() {
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

  async function applyForMerchant() {
    return run(async () => {
      const hash = await writeContractAsync({
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi,
        functionName: "applyForMerchant",
      });
      await confirm(hash);
      return hash;
    });
  }

  async function createOffer(
    side: OfferSide,
    token: `0x${string}`,
    fiatCurrency: string,
    rate: bigint,
    minAmount: bigint,
    maxAmount: bigint,
    terms: string
  ) {
    return run(async () => {
      const hash = await writeContractAsync({
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi,
        functionName: "createOffer",
        args: [side, token, fiatCurrency, rate, minAmount, maxAmount, terms],
      });
      await confirm(hash);
      return hash;
    });
  }

  async function pauseOffer(offerId: bigint) {
    return run(async () => {
      const hash = await writeContractAsync({
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi,
        functionName: "pauseOffer",
        args: [offerId],
      });
      await confirm(hash);
      return hash;
    });
  }

  async function resumeOffer(offerId: bigint) {
    return run(async () => {
      const hash = await writeContractAsync({
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi,
        functionName: "resumeOffer",
        args: [offerId],
      });
      await confirm(hash);
      return hash;
    });
  }

  return { busy, confirming, error, applyForMerchant, createOffer, pauseOffer, resumeOffer };
}
