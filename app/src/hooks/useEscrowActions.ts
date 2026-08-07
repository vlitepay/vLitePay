"use client";

import { useState } from "react";
import { useWriteContract, usePublicClient } from "wagmi";
import { decodeEventLog } from "viem";
import { CONTRACTS, TOKENS, TokenSymbol } from "@/lib/constants";
import { p2pEscrowAbi, erc20AllowanceAbi } from "@/lib/abi/p2pEscrow";

/**
 * Centralizes every P2PEscrow write call the trading UI needs. Each action
 * returns a promise that resolves once the transaction is mined, and tracks
 * a simple busy/error state so components can disable buttons + show spinners
 * without duplicating try/catch boilerplate everywhere.
 */
export function useEscrowActions() {
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

  /** Approves the escrow contract to pull `amount` (smallest units) of `tokenSymbol`, then waits for confirmation. */
  async function approveToken(tokenSymbol: TokenSymbol, amount: bigint) {
    return run(async () => {
      const hash = await writeContractAsync({
        address: TOKENS[tokenSymbol].address,
        abi: erc20AllowanceAbi,
        functionName: "approve",
        args: [CONTRACTS.p2pEscrow, amount],
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      return hash;
    });
  }

  /**
   * Accepts an offer, locking `amount` (smallest units) in escrow.
   * Assumes allowance is already sufficient for the party whose funds get pulled.
   * Returns the new tradeId parsed from the TradeLocked event, plus the tx hash.
   */
  async function acceptOffer(offerId: bigint, amount: bigint, fiatAmount: bigint, useAlternateTimer: boolean) {
    return run(async () => {
      const hash = await writeContractAsync({
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi,
        functionName: "acceptOffer",
        args: [offerId, amount, fiatAmount, useAlternateTimer],
      });
      const receipt = await publicClient?.waitForTransactionReceipt({ hash });

      let tradeId: bigint | null = null;
      for (const log of receipt?.logs ?? []) {
        try {
          const decoded = decodeEventLog({ abi: p2pEscrowAbi, data: log.data, topics: log.topics, eventName: "TradeLocked" });
          tradeId = decoded.args.tradeId as bigint;
          break;
        } catch {
          // not the event we're looking for — keep scanning
        }
      }

      return { hash, tradeId };
    });
  }

  async function markFiatSent(tradeId: bigint) {
    return run(async () => {
      const hash = await writeContractAsync({
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi,
        functionName: "markFiatSent",
        args: [tradeId],
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      return hash;
    });
  }

  async function releaseFunds(tradeId: bigint) {
    return run(async () => {
      const hash = await writeContractAsync({
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi,
        functionName: "releaseFunds",
        args: [tradeId],
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      return hash;
    });
  }

  async function cancelTrade(tradeId: bigint) {
    return run(async () => {
      const hash = await writeContractAsync({
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi,
        functionName: "cancelTrade",
        args: [tradeId],
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      return hash;
    });
  }

  async function raiseDispute(tradeId: bigint, evidenceURI: string) {
    return run(async () => {
      const hash = await writeContractAsync({
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi,
        functionName: "raiseDispute",
        args: [tradeId, evidenceURI],
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      return hash;
    });
  }

  async function rateTrade(tradeId: bigint, stars: number, comment: string) {
    return run(async () => {
      const hash = await writeContractAsync({
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi,
        functionName: "rateTrade",
        args: [tradeId, stars, comment],
      });
      await publicClient?.waitForTransactionReceipt({ hash });
      return hash;
    });
  }

  return {
    busy,
    error,
    approveToken,
    acceptOffer,
    markFiatSent,
    releaseFunds,
    cancelTrade,
    raiseDispute,
    rateTrade,
  };
}
