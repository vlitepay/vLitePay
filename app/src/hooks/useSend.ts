"use client";

import { useState } from "react";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { pad } from "viem";
import { CONTRACTS, TOKENS, TokenSymbol } from "@/lib/constants";
import { erc20AllowanceAbi } from "@/lib/abi/p2pEscrow";
import { tokenMessengerAbi, CCTP_FINALITY_THRESHOLD } from "@/lib/abi/tokenMessenger";
import { useTreasuryAddress } from "./useTreasuryAddress";
import { waitForReceiptRobust, ReceiptRevertedError, ReceiptTimeoutError } from "@/lib/waitForReceipt";

function describeConfirmError(err: unknown, fallback: string): string {
  if (err instanceof ReceiptRevertedError) return "Transaction reverted on-chain — no funds were moved.";
  if (err instanceof ReceiptTimeoutError) return err.message;
  return (err as any)?.shortMessage || (err as any)?.message || fallback;
}

/**
 * vLitePay doesn't yet have a dedicated on-chain "Transfer" contract, so the
 * configurable send fee is enforced here client-side as two sequential ERC20
 * transfers (net amount to the recipient, fee to the treasury). This is NOT
 * atomic — a production build should wrap both legs in a single contract call
 * so they either both succeed or both revert.
 *
 * IMPORTANT — why this is two wallet confirmations, and why that can't be
 * safely collapsed to one without a contract change:
 *   - Each `transfer()` below is a genuinely separate on-chain transaction.
 *     Every wallet (Circle's PIN challenge, MetaMask, any WalletConnect
 *     wallet) must prompt once per distinct transaction — that's a core
 *     EIP-1193 security property, not something any connector can skip.
 *     This is why the "double popup" happens identically for Circle wallets
 *     and WalletConnect: it's this app-level two-call logic, not a
 *     connector-specific bug.
 *   - Batching both transfers via Arc's already-deployed Multicall3 (see
 *     lib/constants.ts's arcTestnet.contracts.multicall3) does NOT work
 *     here: when Multicall3 executes a sub-call, the ERC20 contract sees
 *     `msg.sender` as Multicall3's own address, not the user's wallet — so
 *     `transfer()` would try to move tokens out of Multicall3's balance
 *     instead of the user's, and would simply revert.
 *   - A true single-signature send requires either a purpose-built
 *     "send + fee" contract (out of scope — this project's standing rule is
 *     no smart contract changes) or `approve()` + `transferFrom()` through a
 *     router (a *third* transaction, making this worse).
 *   - `step` below doesn't reduce the confirmation count; it lets the UI
 *     clearly label which of the two expected prompts is happening
 *     ("1 of 2" / "2 of 2") instead of leaving the second one unexplained.
 *
 * `confirming` flips true right after the wallet hands back a hash (the
 * Circle PIN popup / WalletConnect prompt has closed) and stays true until
 * waitForReceiptRobust actually confirms it on-chain — SendPanel uses this
 * to show a "Confirming on-chain…" state distinct from "waiting on wallet".
 */
export function useLocalSend() {
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { treasury } = useTreasuryAddress();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [step, setStep] = useState<"recipient" | "fee" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(tokenSymbol: TokenSymbol, recipient: `0x${string}`, netAmount: bigint, feeAmount: bigint) {
    setBusy(true);
    setError(null);
    const hasFeeLeg = feeAmount > 0n && !!treasury;
    setStep(hasFeeLeg ? "recipient" : null);
    try {
      const hash1 = await writeContractAsync({
        address: TOKENS[tokenSymbol].address,
        abi: erc20AllowanceAbi,
        functionName: "transfer",
        args: [recipient, netAmount],
      });
      setConfirming(true);
      await waitForReceiptRobust(publicClient, hash1);
      setConfirming(false);

      if (hasFeeLeg) {
        setStep("fee");
        const hash2 = await writeContractAsync({
          address: TOKENS[tokenSymbol].address,
          abi: erc20AllowanceAbi,
          functionName: "transfer",
          args: [treasury, feeAmount],
        });
        setConfirming(true);
        await waitForReceiptRobust(publicClient, hash2);
      }

      return hash1;
    } catch (err: any) {
      // Either writeContractAsync itself threw (rejected in the wallet,
      // Circle challenge failed, etc.) or waitForReceiptRobust genuinely
      // exhausted its retries/timeout, or the transaction confirmed but
      // reverted — describeConfirmError tells these apart for the message
      // shown to the user.
      setError(describeConfirmError(err, "Transfer failed"));
      return null;
    } finally {
      setBusy(false);
      setConfirming(false);
      setStep(null);
    }
  }

  return { send, busy, confirming, step, error };
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
  const [confirming, setConfirming] = useState(false);
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

        setConfirming(true);
        const approveReceipt = await waitForReceiptRobust(publicClient, approveHash);
        setConfirming(false);
        console.log("[CCTP] approve() confirmed in block", approveReceipt.blockNumber, "status:", approveReceipt.status);
      } else {
        console.log("[CCTP] existing allowance already covers this amount — skipping approve()");
      }

      // --- Step 2: burn via depositForBurn (CCTP V2 fast-transfer signature) ---
      // mintRecipient must be the destination address left-padded to bytes32 —
      // CCTP's message format always uses a 32-byte recipient field regardless
      // of the destination chain's native address width.
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

      setConfirming(true);
      const receipt = await waitForReceiptRobust(publicClient, hash);
      console.log("[CCTP] depositForBurn() confirmed in block", receipt.blockNumber, "status:", receipt.status);

      return hash;
    } catch (err: any) {
      console.error("[CCTP] sendCrossChain failed:", err);
      setError(describeConfirmError(err, "Cross-chain send failed"));
      return null;
    } finally {
      setBusy(false);
      setConfirming(false);
    }
  }

  return { sendCrossChain, busy, confirming, error };
}
