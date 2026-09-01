"use client";

import { useState } from "react";
import { useWriteContract, usePublicClient } from "wagmi";
import { decodeEventLog } from "viem";
import { CONTRACTS, TOKENS, TokenSymbol } from "@/lib/constants";
import { p2pEscrowAbi, erc20AllowanceAbi } from "@/lib/abi/p2pEscrow";
import { waitForReceiptRobust, ReceiptRevertedError, ReceiptTimeoutError } from "@/lib/waitForReceipt";
import { describeCircleWriteError } from "@/lib/circleErrors";

/**
 * Centralizes every P2PEscrow write call the trading UI needs. Each action
 * returns a promise that resolves once the transaction is mined, and tracks
 * busy/confirming/error state so components can disable buttons + show
 * spinners without duplicating try/catch boilerplate everywhere.
 *
 * `confirming` flips true right after the wallet hands back a hash (the
 * popup has closed) and stays true until waitForReceiptRobust actually
 * confirms it on-chain — components can use it to show a "Confirming
 * on-chain…" state distinct from "waiting on the wallet".
 */
export function useEscrowActions() {
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
        setError("Transaction reverted on-chain — no funds were moved.");
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

  /** Approves the escrow contract to pull `amount` (smallest units) of `tokenSymbol`, then waits for confirmation. */
  async function approveToken(tokenSymbol: TokenSymbol, amount: bigint) {
    return run(async () => {
      const hash = await writeContractAsync({
        address: TOKENS[tokenSymbol].address,
        abi: erc20AllowanceAbi,
        functionName: "approve",
        args: [CONTRACTS.p2pEscrow, amount],
      });
      await confirm(hash);
      return hash;
    });
  }

  /**
   * Accepts an offer, locking `amount` (smallest units) in escrow.
   * Assumes allowance is already sufficient for the party whose funds get pulled.
   * Returns the new tradeId parsed from the TradeLocked event, plus the tx hash.
   * The tradeId is only ever returned once the receipt is confirmed —
   * callers (e.g. app/p2p/offer/[id]/page.tsx setting activeTradeId) should
   * treat a non-null tradeId here as proof of on-chain success, not just a
   * submitted transaction.
   */
  async function acceptOffer(offerId: bigint, amount: bigint, fiatAmount: bigint, useAlternateTimer: boolean) {
    return run(async () => {
      const hash = await writeContractAsync({
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi,
        functionName: "acceptOffer",
        args: [offerId, amount, fiatAmount, useAlternateTimer],
      });
      const receipt = await confirm(hash);

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
      await confirm(hash);
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
      await confirm(hash);
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
      await confirm(hash);
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
      await confirm(hash);
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
      await confirm(hash);
      return hash;
    });
  }

  return {
    busy,
    confirming,
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
