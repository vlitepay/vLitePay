"use client";

import { useState } from "react";
import { useWriteContract, usePublicClient } from "wagmi";
import { CONTRACTS } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";
import { OfferSide } from "@/lib/types/p2p";

export function useMerchantActions() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (err: any) {
      setError(err?.shortMessage || err?.message || "Transaction failed");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function applyForMerchant() {
    return run(async () => {
      const hash = await writeContractAsync({
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi,
        functionName: "applyForMerchant",
      });
      await publicClient?.waitForTransactionReceipt({ hash });
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
      await publicClient?.waitForTransactionReceipt({ hash });
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
      await publicClient?.waitForTransactionReceipt({ hash });
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
      await publicClient?.waitForTransactionReceipt({ hash });
      return hash;
    });
  }

  return { busy, error, applyForMerchant, createOffer, pauseOffer, resumeOffer };
}
