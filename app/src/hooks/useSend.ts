"use client";

import { useState } from "react";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { pad } from "viem";
import type { TransactionReceipt } from "viem";
import { CONTRACTS, TOKENS, TokenSymbol } from "@/lib/constants";
import { erc20AllowanceAbi } from "@/lib/abi/p2pEscrow";
import { tokenMessengerAbi, CCTP_FINALITY_THRESHOLD } from "@/lib/abi/tokenMessenger";
import { useTreasuryAddress } from "./useTreasuryAddress";

/**
 * "Soft" receipt confirmation. By the time this runs, `writeContractAsync`
 * has already resolved successfully — for a Circle wallet specifically,
 * that means Circle's own transaction-status polling already confirmed
 * COMPLETE/CONFIRMED server-side before ever handing back a hash (see
 * lib/circleConnector.ts's pollForTxHash). This follow-up on-chain receipt
 * check is an extra confirmation, not a precondition for success: it used
 * to be awaited with no timeout and any failure there (RPC hiccup, brief
 * indexing lag between Circle's confirmation and the node being queried)
 * was caught as a hard error — overriding an already-successful, already
 * on-chain transaction with "An unknown RPC error occurred" and no txHash
 * ever shown, even though the send was visible on Arcscan the whole time.
 *
 * Arc has near-instant finality, so a short bounded wait is enough to
 * confirm the common case quickly without making a slow RPC block the
 * success UI. If it doesn't resolve in time, that's a confirmation-check
 * failure, not proof the transaction didn't happen — callers get `null`
 * back and proceed with the hash they already have instead of failing.
 * A transaction that genuinely reverted is a different thing entirely
 * (the wait *succeeds* and returns a receipt with `status: "reverted"`)
 * and callers that care still check that explicitly.
 */
async function waitForReceiptSoft(
  publicClient: ReturnType<typeof usePublicClient> | undefined,
  hash: `0x${string}`,
  label: string
): Promise<TransactionReceipt | null> {
  if (!publicClient) return null;
  try {
    return await publicClient.waitForTransactionReceipt({ hash, timeout: 15_000 });
  } catch (err) {
    console.warn(
      `[send] ${label} confirmation check timed out or failed — the transaction was already broadcast ` +
        `(${hash}) and should already be visible on Arcscan. Continuing without blocking on this RPC call.`,
      err
    );
    return null;
  }
}

/**
 * vLitePay doesn't yet have a dedicated on-chain "Transfer" contract, so the
 * configurable send fee is enforced here client-side as two sequential ERC20
 * transfers (net amount to the recipient, fee to the treasury). This is NOT
 * atomic — a production build should wrap both legs in a single contract call
 * so they either both succeed or both revert.
 */
export function useLocalSend() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { treasury } = useTreasuryAddress();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(tokenSymbol: TokenSymbol, recipient: `0x${string}`, netAmount: bigint, feeAmount: bigint) {
    setBusy(true);
    setError(null);
    try {
      const hash1 = await writeContractAsync({
        address: TOKENS[tokenSymbol].address,
        abi: erc20AllowanceAbi,
        functionName: "transfer",
        args: [recipient, netAmount],
      });
      // Soft confirmation only — a failed/timed-out wait here must not
      // undo a transfer that already broadcast successfully.
      await waitForReceiptSoft(publicClient, hash1, "transfer");

      if (feeAmount > 0n && treasury) {
        const hash2 = await writeContractAsync({
          address: TOKENS[tokenSymbol].address,
          abi: erc20AllowanceAbi,
          functionName: "transfer",
          args: [treasury, feeAmount],
        });
        await waitForReceiptSoft(publicClient, hash2, "fee transfer");
      }

      return hash1;
    } catch (err: any) {
      // Reaching here means writeContractAsync itself threw — a genuine
      // submission failure (rejected in the wallet, Circle challenge
      // failed, etc.), not a soft confirmation-check issue.
      setError(err?.shortMessage || err?.message || "Transfer failed");
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { send, busy, error };
}

// --- CCTP V2 fast-transfer gas limits ---
// Explicit gas limits so wallets don't have to rely on (sometimes flaky)
// `eth_estimateGas` against a testnet RPC. approve() is a simple storage
// write — 120k is comfortably above the ~46-50k ERC20 approve typically
// costs. depositForBurn on TokenMessengerV2 does a burn + message-hashing +
// event emission across a proxy/delegatecall, which is meaningfully heavier
// than a plain token transfer — 900k gives solid headroom above the ~250-450k
// these calls tend to use in practice.
const APPROVE_GAS_LIMIT = 120_000n;
const DEPOSIT_FOR_BURN_GAS_LIMIT = 900_000n; // 800k+ as requested, rounded up for margin

// Max fee ceiling for CCTP V2 fast transfers, as bps of the bridged amount.
// This must be >= Circle's current fast-transfer fee for the route or the
// message silently falls back to standard finality (it does NOT revert) —
// production apps should query Circle's fee API
// (GET https://iris-api.circle.com/v2/burn/USDC/fees/{sourceDomain}/{destinationDomain})
// for the live rate instead of trusting a hardcoded constant.
const CCTP_MAX_FEE_BPS = 10n; // 0.10% conservative default

/** Cross-chain USDC send via Circle CCTP V2 — burns on Arc, mints natively on the destination domain. */
export function useCctpSend() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCrossChain(amount: bigint, destinationDomain: number, recipientAddress: `0x${string}`) {
    if (!CONTRACTS.tokenMessenger) {
      setError("CCTP TokenMessenger address isn't configured for this environment yet.");
      return null;
    }
    if (!publicClient || !address) {
      setError("Wallet not connected.");
      return null;
    }

    setBusy(true);
    setError(null);

    try {
      // --- Step 1: check existing allowance, only approve if actually needed ---
      // Avoids a redundant approval tx (and its gas cost) on repeat sends once
      // the TokenMessenger already has sufficient allowance.
      const currentAllowance = (await publicClient.readContract({
        address: TOKENS.USDC.address,
        abi: erc20AllowanceAbi,
        functionName: "allowance",
        args: [address, CONTRACTS.tokenMessenger],
      })) as bigint;

      console.log("[CCTP] current USDC allowance for TokenMessengerV2:", currentAllowance.toString(), "need:", amount.toString());

      if (currentAllowance < amount) {
        console.log("[CCTP] insufficient allowance — sending approve() for", amount.toString(), "USDC (smallest units)");

        const approveHash = await writeContractAsync({
          address: TOKENS.USDC.address,
          abi: erc20AllowanceAbi,
          functionName: "approve",
          args: [CONTRACTS.tokenMessenger, amount],
          gas: APPROVE_GAS_LIMIT,
        });
        console.log("[CCTP] approve() submitted:", approveHash);

        // Soft confirmation: if this can't be verified within the short
        // window, we still proceed — approve() already broadcast
        // successfully (writeContractAsync didn't throw). If it genuinely
        // reverted, depositForBurn below will fail on its own from
        // insufficient allowance and surface a real error then.
        const approveReceipt = await waitForReceiptSoft(publicClient, approveHash, "USDC approve");
        if (approveReceipt) {
          console.log("[CCTP] approve() confirmed in block", approveReceipt.blockNumber, "status:", approveReceipt.status);
          if (approveReceipt.status !== "success") {
            setError("USDC approval failed — depositForBurn was not attempted.");
            return null;
          }
        }
      } else {
        console.log("[CCTP] existing allowance already covers this amount — skipping approve()");
      }

      // --- Step 2: burn via depositForBurn (CCTP V2 fast-transfer signature) ---
      // mintRecipient must be the destination address left-padded to bytes32 —
      // CCTP's message format always uses a 32-byte recipient field regardless
      // of the destination chain's native address width (e.g. Solana pubkeys
      // are already 32 bytes; EVM addresses need this explicit left-pad).
      const mintRecipient = pad(recipientAddress, { size: 32 });
      const maxFee = (amount * CCTP_MAX_FEE_BPS) / 10_000n;
      // bytes32(0) — allows any address to complete the mint on the destination domain
      // (no permissioned relayer required). Written out explicitly (rather than relying
      // on a library constant) so the exact 32-byte length is unambiguous.
      const destinationCaller = `0x${"0".repeat(64)}` as `0x${string}`;

      console.log("[CCTP] depositForBurn params:", {
        amount: amount.toString(),
        destinationDomain,
        mintRecipient,
        burnToken: TOKENS.USDC.address,
        destinationCaller,
        maxFee: maxFee.toString(),
        minFinalityThreshold: CCTP_FINALITY_THRESHOLD.FAST,
      });

      const hash = await writeContractAsync({
        address: CONTRACTS.tokenMessenger,
        abi: tokenMessengerAbi,
        functionName: "depositForBurn",
        args: [amount, destinationDomain, mintRecipient, TOKENS.USDC.address, destinationCaller, maxFee, CCTP_FINALITY_THRESHOLD.FAST],
        gas: DEPOSIT_FOR_BURN_GAS_LIMIT,
      });
      console.log("[CCTP] depositForBurn() submitted:", hash);

      // Soft confirmation, same reasoning as approve() above — a failed/
      // timed-out wait here must not undo a burn that already broadcast
      // successfully. Arc has near-instant finality, so this resolves
      // quickly in the common case; a real revert still surfaces below
      // whenever the receipt does come back.
      const receipt = await waitForReceiptSoft(publicClient, hash, "depositForBurn");
      if (receipt) {
        console.log("[CCTP] depositForBurn() confirmed in block", receipt.blockNumber, "status:", receipt.status);
        if (receipt.status !== "success") {
          setError("depositForBurn transaction reverted — check the tx trace for the revert reason.");
          return null;
        }
      }

      return hash;
    } catch (err: any) {
      console.error("[CCTP] sendCrossChain failed:", err);
      setError(err?.shortMessage || err?.message || "Cross-chain send failed");
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { sendCrossChain, busy, error };
}
