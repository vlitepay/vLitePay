"use client";

import { useState } from "react";
import type { Abi } from "viem";
import { useWriteContract, usePublicClient } from "wagmi";
import { CONTRACTS } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";
import { waitForReceiptRobust, ReceiptRevertedError, ReceiptTimeoutError } from "@/lib/waitForReceipt";

export function useAdminActions() {
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
        setError(err?.shortMessage || err?.message || "Transaction failed");
      }
      return null;
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  /**
   * Generic dispatcher for admin writes: `functionName` is picked at runtime
   * (by whichever exported action below calls it), so wagmi/viem can't know
   * in advance which of `p2pEscrowAbi`'s per-function argument tuples to
   * check `args` against. Left as `p2pEscrowAbi`'s own literal type, TS tries
   * to match `args` (a plain array) against a big union of exact-length
   * tuples and fails — hence the original "Type 'any[]' is not assignable"
   * error. Widening just the `abi` param to viem's generic `Abi` type here
   * (via `as Abi`) tells wagmi to use its loose/dynamic call overload
   * instead, which accepts `functionName: string` and `args: readonly
   * unknown[]` directly — no `any` casts needed. Type safety isn't lost
   * where it matters: every exported action function below still declares
   * its own precise parameter types (addresses, bigints, etc.), so callers
   * of `useAdminActions()` get full autocomplete/type-checking; only this
   * one internal dispatch point intentionally opts out of per-function ABI
   * inference, which is unavoidable for a dynamic-by-name call helper.
   */
  async function write(functionName: string, args: readonly unknown[]) {
    return run(async () => {
      const hash = await writeContractAsync({
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi as Abi,
        functionName,
        args,
      });
      setConfirming(true);
      try {
        await waitForReceiptRobust(publicClient, hash);
      } finally {
        setConfirming(false);
      }
      return hash;
    });
  }

  return {
    busy,
    confirming,
    error,
    approveMerchant: (addr: `0x${string}`) => write("approveMerchant", [addr]),
    rejectMerchant: (addr: `0x${string}`) => write("rejectMerchant", [addr]),
    restrictMerchant: (addr: `0x${string}`) => write("restrictMerchant", [addr]),
    resolveDispute: (tradeId: bigint, amountToBuyer: bigint) => write("resolveDispute", [tradeId, amountToBuyer]),
    addArbiter: (addr: `0x${string}`) => write("addArbiter", [addr]),
    removeArbiter: (addr: `0x${string}`) => write("removeArbiter", [addr]),
    setMakerFee: (bps: bigint) => write("setMakerFee", [bps]),
    setTakerFee: (bps: bigint) => write("setTakerFee", [bps]),
    setSendFee: (bps: bigint) => write("setSendFee", [bps]),
    setAirtimeFee: (bps: bigint) => write("setAirtimeFee", [bps]),
    setTimers: (defaultSec: bigint, altSec: bigint) => write("setTimers", [defaultSec, altSec]),
    setSupportedToken: (token: `0x${string}`, enabled: boolean) => write("setSupportedToken", [token, enabled]),
    setSupportedFiat: (currency: string, enabled: boolean) => write("setSupportedFiat", [currency, enabled]),
  };
}
