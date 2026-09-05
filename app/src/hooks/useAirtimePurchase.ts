"use client";

import { useState } from "react";
import { useWriteContract, usePublicClient } from "wagmi";
import { erc20AllowanceAbi } from "@/lib/abi/p2pEscrow";
import { TOKENS, TokenSymbol } from "@/lib/constants";
import { useTreasuryAddress } from "./useTreasuryAddress";
import { waitForReceiptRobust, ReceiptRevertedError, ReceiptTimeoutError } from "@/lib/waitForReceipt";
import { describeCircleWriteError } from "@/lib/circleErrors";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export interface AirtimePurchaseInput {
  tokenSymbol: TokenSymbol;
  tokenAmount: bigint; // total charged, fee-inclusive
  operatorId: number;
  amount: number; // destination-currency amount Reloadly tops up
  recipientPhone: string;
  recipientCountryCode: string;
}

export interface AirtimePurchaseResult {
  hash: `0x${string}`;
  transactionId: string | null;
  status: string | null;
  operatorTransactionId: string | null;
  operatorName: string | null;
}

/**
 * Dedicated top-up payment flow: ONE direct ERC20 `transfer` of the total
 * (top-up amount + fee) straight to the treasury address — no approve/
 * transferFrom two-step, no separate fee transaction. Both the fee and the
 * top-up amount stay in the treasury; Reloadly is paid separately out of
 * its own prepaid balance once the backend has verified this transaction
 * on-chain (see backend/src/lib/chain.ts).
 */
export function useAirtimePurchase() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { treasury } = useTreasuryAddress();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "paying" | "confirming" | "done">("idle");

  async function purchase(input: AirtimePurchaseInput): Promise<AirtimePurchaseResult | null> {
    if (!treasury) {
      setError("Treasury address not loaded yet — try again in a moment.");
      return null;
    }

    setBusy(true);
    setError(null);
    try {
      setStep("paying");
      const hash = await writeContractAsync({
        address: TOKENS[input.tokenSymbol].address,
        abi: erc20AllowanceAbi,
        functionName: "transfer",
        args: [treasury, input.tokenAmount],
      });
      await waitForReceiptRobust(publicClient, hash);

      setStep("confirming");
      const res = await fetch(`${BACKEND_URL}/airtime/topup`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: input.operatorId,
          amount: input.amount,
          recipientPhone: input.recipientPhone,
          recipientCountryCode: input.recipientCountryCode,
          tokenSymbol: input.tokenSymbol,
          tokenAmount: input.tokenAmount.toString(),
          vlitePayTxHash: hash,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(
          body?.error
            ? `${body.error} (payment confirmed on-chain — contact support with tx ${hash} if this persists)`
            : "Payment confirmed on-chain, but the top-up provider request failed. Contact support with tx " + hash
        );
      }

      // Reloadly's own response — captured so the receipt card can show a
      // real transactionId and poll for a real status update, rather than
      // just knowing the on-chain payment succeeded.
      const topup = await res.json().catch(() => ({}));

      setStep("done");
      return {
        hash,
        transactionId: topup?.transactionId !== undefined ? String(topup.transactionId) : null,
        status: topup?.status ?? null,
        operatorTransactionId: topup?.operatorTransactionId ?? null,
        operatorName: topup?.operatorName ?? null,
      };
    } catch (err: any) {
      if (err instanceof ReceiptRevertedError) {
        setError("Transaction reverted on-chain — no funds were charged.");
      } else if (err instanceof ReceiptTimeoutError) {
        setError(err.message);
      } else {
        setError(describeCircleWriteError(err, "Top up purchase failed"));
      }
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { purchase, busy, error, step };
}
