"use client";

import { useState } from "react";
import { useAccount, useWriteContract, usePublicClient } from "wagmi";
import { pad, maxUint256 } from "viem";
import { CONTRACTS, TOKENS, TokenSymbol } from "@/lib/constants";
import { erc20AllowanceAbi } from "@/lib/abi/p2pEscrow";
import { sendWithFeeAbi } from "@/lib/abi/sendWithFee";
import { tokenMessengerAbi, CCTP_FINALITY_THRESHOLD, FORWARDING_SERVICE_HOOK_DATA, FORWARDING_DESTINATION_CALLER } from "@/lib/abi/tokenMessenger";
import { fetchCctpFeeQuotes, pickBestFeeQuote, CCTP_DOMAIN } from "@/lib/cctp";
import { useTreasuryAddress } from "./useTreasuryAddress";
import { waitForReceiptRobust, ReceiptRevertedError, ReceiptTimeoutError } from "@/lib/waitForReceipt";
import { describeCircleWriteError } from "@/lib/circleErrors";

function describeConfirmError(err: unknown, fallback: string): string {
  if (err instanceof ReceiptRevertedError) return "Transaction reverted on-chain — no funds were moved.";
  if (err instanceof ReceiptTimeoutError) return err.message;
  return describeCircleWriteError(err, fallback);
}

/**
 * Local (same-chain, Arc) send with an optional configurable fee.
 *
 * As of the SendWithFee contract (contracts/src/SendWithFee.sol), a fee-on
 * send is a SINGLE wallet confirmation once the SendWithFee contract has
 * sufficient allowance: SendWithFee.sendWithFee() pulls both the recipient
 * leg and the fee leg via transferFrom in one atomic transaction — either
 * both succeed or the whole call reverts, unlike the old two-`transfer()`
 * approach this replaces (which could partially succeed: recipient paid,
 * fee never collected, or vice versa, if the second call failed).
 *
 * THREE PATHS, chosen automatically per send:
 *   1. No fee applies (feeAmount === 0, or no treasury configured) — a
 *      single plain ERC20 transfer(), exactly as before. No contract call,
 *      no allowance/approve step, unaffected by any of this.
 *   2. Fee applies AND CONTRACTS.sendWithFee is configured — the new atomic
 *      path. If the contract's current allowance already covers
 *      netAmount + feeAmount (e.g. a repeat sender within an
 *      already-approved allowance), this is ONE confirmation total. If
 *      allowance is insufficient, one approve() confirmation is needed
 *      first (standard ERC20 reality — a contract can't pull tokens it
 *      hasn't been approved for) — approving a large (maxUint256)
 *      allowance rather than the exact amount needed for just this send,
 *      so this approval step is a one-time cost rather than something
 *      every single send re-triggers. (Earlier versions of this hook
 *      approved exactly `netAmount + feeAmount` — but SendWithFee's two
 *      transferFrom calls fully consume that exact allowance in the same
 *      transaction, so it was back to 0 immediately after every send,
 *      guaranteeing the next send would need to re-approve regardless of
 *      amount. That was the actual bug, not the allowance comparison
 *      itself.) After the first approval, every subsequent send of any
 *      amount is a single sendWithFee confirmation, until the user (or a
 *      future revoke flow) explicitly lowers the allowance.
 *   3. Fee applies but CONTRACTS.sendWithFee is NOT configured (env var
 *      unset, contract not deployed yet on this environment) — falls back
 *      to the previous two-separate-transfers behavior. This is the
 *      non-breaking safety net: an environment that hasn't deployed/wired
 *      SendWithFee yet keeps working exactly as it did before this change,
 *      just without the single-confirmation improvement.
 *
 * `step` describes whichever path is active, for SendPanel's UI messaging:
 *   - path 2: "approve" (only if needed) then "send"
 *   - path 3 (fallback): "recipient" then "fee" — same labels as before
 *   - path 1: null throughout (only one thing ever happens)
 *
 * `confirming` flips true right after the wallet hands back a hash (the
 * Circle PIN popup / WalletConnect prompt has closed) and stays true until
 * waitForReceiptRobust actually confirms it on-chain — SendPanel uses this
 * to show a "Confirming on-chain…" state distinct from "waiting on wallet".
 */
export function useLocalSend() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { treasury } = useTreasuryAddress();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [step, setStep] = useState<"recipient" | "fee" | "approve" | "send" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(tokenSymbol: TokenSymbol, recipient: `0x${string}`, netAmount: bigint, feeAmount: bigint) {
    setBusy(true);
    setError(null);

    const hasFee = feeAmount > 0n && !!treasury;
    const tokenAddress = TOKENS[tokenSymbol].address;

    try {
      // --- Path 1: no fee — unchanged single transfer. ---
      if (!hasFee) {
        setStep(null);
        const hash = await writeContractAsync({
          address: tokenAddress,
          abi: erc20AllowanceAbi,
          functionName: "transfer",
          args: [recipient, netAmount],
        });
        setConfirming(true);
        await waitForReceiptRobust(publicClient, hash);
        return hash;
      }

      // --- Path 2: fee applies, SendWithFee configured — atomic single tx. ---
      if (CONTRACTS.sendWithFee) {
        const total = netAmount + feeAmount;

        const currentAllowance = (await publicClient.readContract({
          address: tokenAddress,
          abi: erc20AllowanceAbi,
          functionName: "allowance",
          args: [address as `0x${string}`, CONTRACTS.sendWithFee],
        })) as bigint;

        if (currentAllowance < total) {
          // Approve a large allowance rather than the exact `total` needed
          // for THIS send. This is the actual fix, not the comparison
          // above (that was already correct): SendWithFee's two
          // transferFrom calls together consume exactly what's approved,
          // so approving only `total` meant allowance was back to 0
          // immediately after every send — guaranteeing the very next send
          // would fail this same check and re-trigger approval, regardless
          // of the send amount. Approving maxUint256 once means every
          // future send (of any amount) passes this check and goes
          // straight to the single sendWithFee confirmation, until the
          // user (or a future revoke flow) explicitly lowers it. Same
          // "infinite approval" pattern used by most token-approval-based
          // dApps — SendWithFee itself has no admin/owner and only ever
          // pulls exactly the amounts passed into a given call, so this
          // isn't granting it any capability beyond what one already
          // trusts it with per-call.
          setStep("approve");
          const approveHash = await writeContractAsync({
            address: tokenAddress,
            abi: erc20AllowanceAbi,
            functionName: "approve",
            args: [CONTRACTS.sendWithFee, maxUint256],
          });
          setConfirming(true);
          await waitForReceiptRobust(publicClient, approveHash);
          setConfirming(false);
        }

        setStep("send");
        const hash = await writeContractAsync({
          address: CONTRACTS.sendWithFee,
          abi: sendWithFeeAbi,
          functionName: "sendWithFee",
          args: [tokenAddress, recipient, netAmount, treasury as `0x${string}`, feeAmount],
        });
        setConfirming(true);
        await waitForReceiptRobust(publicClient, hash);
        return hash;
      }

      // --- Path 3: fee applies but SendWithFee isn't deployed/configured
      // on this environment yet — old two-transaction fallback, unchanged
      // from before this feature existed. ---
      setStep("recipient");
      const hash1 = await writeContractAsync({
        address: tokenAddress,
        abi: erc20AllowanceAbi,
        functionName: "transfer",
        args: [recipient, netAmount],
      });
      setConfirming(true);
      await waitForReceiptRobust(publicClient, hash1);
      setConfirming(false);

      setStep("fee");
      const hash2 = await writeContractAsync({
        address: tokenAddress,
        abi: erc20AllowanceAbi,
        functionName: "transfer",
        args: [treasury, feeAmount],
      });
      setConfirming(true);
      await waitForReceiptRobust(publicClient, hash2);

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

/**
 * Cross-chain USDC send via Circle CCTP V2 — burns on Arc, mints natively
 * on the destination domain.
 *
 * PLATFORM FEE: previously, SendPanel already computed feeUnits/netUnits
 * for cross-chain sends (same admin-configured feeBps as local send — see
 * SendPanel.tsx's useSendFee, reading P2PEscrow.sendFeeBps) and passed only
 * the NET amount here to burn — but nothing ever collected the fee
 * portion; it simply stayed in the sender's own wallet, uncollected. This
 * hook now accepts an explicit `feeAmount` and, when > 0, sends it to the
 * treasury via a single plain ERC20 transfer() BEFORE the existing
 * approve/burn flow — CCTP's own burn/mint mechanics below are completely
 * unchanged, still operating on exactly `amount` (the net amount SendPanel
 * already computed).
 *
 * Why a plain transfer() rather than reusing SendWithFee.sol or wrapping
 * depositForBurn in a new contract: depositForBurn burns from msg.sender's
 * own balance via TokenMessenger's own internal pull — a wrapper contract
 * would need to sit between the user and TokenMessenger for every burn,
 * meaning any bug in that wrapper risks the CCTP burn/mint path itself
 * (explicitly must-not-break). A plain transfer() is a well-understood,
 * completely separate operation with no interaction with the burn at all —
 * safer, even though it costs one more confirmation than an atomic
 * combined call would.
 *
 * Zero-fee / fee-disabled: if feeAmount is 0 (or treasury isn't
 * configured), the fee-transfer step is skipped entirely and behavior is
 * byte-for-byte identical to before this change.
 *
 * `step` describes which part of the flow is active, for SendPanel's UI:
 *   "fee" (only if feeAmount > 0) -> "approve" (only if needed) -> "burn"
 */
export interface CctpSendResult {
  hash: `0x${string}`;
  destinationDomain: number;
  /** true if Circle's Forwarding Service was used (Circle mints automatically); false if we fell back to a plain burn (needs a relayer — see app/api/cctp/relay). */
  usedForwarding: boolean;
  /** true if Iris genuinely had no fee quote for this source/destination pair — surfaced so the receipt can say so honestly rather than imply a normal pending mint. */
  irisEmpty: boolean;
}

export function useCctpSend() {
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();
  const { treasury } = useTreasuryAddress();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [step, setStep] = useState<"fee" | "quote" | "approve" | "burn" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function sendCrossChain(
    amount: bigint,
    destinationDomain: number,
    recipientAddress: `0x${string}`,
    feeAmount: bigint = 0n
  ): Promise<CctpSendResult | null> {
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
      // --- Step 0: collect the platform fee on Arc first, if any. ---
      // A plain transfer() from the user's own balance — no approve
      // needed, and no interaction whatsoever with TokenMessenger/CCTP.
      if (feeAmount > 0n && treasury) {
        setStep("fee");
        const feeHash = await writeContractAsync({
          address: TOKENS.USDC.address,
          abi: erc20AllowanceAbi,
          functionName: "transfer",
          args: [treasury, feeAmount],
        });
        setConfirming(true);
        await waitForReceiptRobust(publicClient, feeHash);
        setConfirming(false);
      }

      // --- Step 1: ask Circle's Iris API for a real Forwarding Service
      // fee quote for this source/destination pair. Arc doesn't support
      // Fast as a source today, so pickBestFeeQuote naturally falls back
      // to Standard — see lib/cctp.ts. An empty/failed quote is Iris
      // genuinely having nothing for this pair right now (seen for Arc,
      // domain 26, historically) — not an error to paper over, so we fall
      // back to a plain (non-forwarding) burn using the same conservative
      // fixed-bps fee this app used before Forwarding existed, and flag
      // irisEmpty so the receipt can say so honestly.
      setStep("quote");
      const quotes = await fetchCctpFeeQuotes(CCTP_DOMAIN.arc, destinationDomain, true);
      const quote = quotes ? pickBestFeeQuote(quotes) : null;
      const usedForwarding = !!quote;
      const irisEmpty = !quote;

      const mintRecipient = pad(recipientAddress, { size: 32 });

      let totalBurnAmount: bigint;
      let maxFee: bigint;
      let minFinalityThreshold: number;

      if (quote) {
        // Forwarding: maxFee must cover BOTH the base CCTP protocol fee
        // (minimumFee, in bps) and Circle's own forwarding fee — burning
        // amount + maxFee so the recipient nets exactly `amount` after
        // Circle deducts up to maxFee. Matches Circle's own worked
        // example: "Total to burn (recipient gets recipientAmount)".
        const baseProtocolFee = (amount * BigInt(quote.minimumFee)) / 10_000n;
        const forwardFee = BigInt(quote.forwardFee?.med ?? 0);
        maxFee = baseProtocolFee + forwardFee;
        totalBurnAmount = amount + maxFee;
        minFinalityThreshold = quote.finalityThreshold;
      } else {
        // Fallback: same fixed-bps estimate this app used before
        // Forwarding existed. Fee is deducted FROM `amount` here (not
        // added on top), matching the prior behavior exactly.
        maxFee = (amount * CCTP_MAX_FEE_BPS) / 10_000n;
        totalBurnAmount = amount;
        minFinalityThreshold = CCTP_FINALITY_THRESHOLD.FAST;
      }

      // --- Step 2: check existing allowance, only approve if actually needed ---
      const currentAllowance = (await publicClient.readContract({
        address: TOKENS.USDC.address,
        abi: erc20AllowanceAbi,
        functionName: "allowance",
        args: [address, CONTRACTS.tokenMessenger],
      })) as bigint;

      console.log(
        "[CCTP] current USDC allowance for TokenMessengerV2:",
        currentAllowance.toString(),
        "need:",
        totalBurnAmount.toString()
      );

      if (currentAllowance < totalBurnAmount) {
        console.log("[CCTP] insufficient allowance — sending approve() for", totalBurnAmount.toString(), "USDC (smallest units)");

        setStep("approve");
        const approveHash = await writeContractAsync({
          address: TOKENS.USDC.address,
          abi: erc20AllowanceAbi,
          functionName: "approve",
          args: [CONTRACTS.tokenMessenger, totalBurnAmount],
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

      // --- Step 3: burn — via depositForBurnWithHook (Forwarding Service)
      // if we got a real quote, or the plain depositForBurn fallback.
      console.log("[CCTP] burn params:", {
        usedForwarding,
        totalBurnAmount: totalBurnAmount.toString(),
        destinationDomain,
        mintRecipient,
        burnToken: TOKENS.USDC.address,
        maxFee: maxFee.toString(),
        minFinalityThreshold,
      });

      setStep("burn");
      const hash = usedForwarding
        ? await writeContractAsync({
            address: CONTRACTS.tokenMessenger,
            abi: tokenMessengerAbi,
            functionName: "depositForBurnWithHook",
            args: [
              totalBurnAmount,
              destinationDomain,
              mintRecipient,
              TOKENS.USDC.address,
              FORWARDING_DESTINATION_CALLER,
              maxFee,
              minFinalityThreshold,
              FORWARDING_SERVICE_HOOK_DATA,
            ],
            gas: DEPOSIT_FOR_BURN_GAS_LIMIT,
          })
        : await writeContractAsync({
            address: CONTRACTS.tokenMessenger,
            abi: tokenMessengerAbi,
            functionName: "depositForBurn",
            args: [
              totalBurnAmount,
              destinationDomain,
              mintRecipient,
              TOKENS.USDC.address,
              FORWARDING_DESTINATION_CALLER,
              maxFee,
              minFinalityThreshold,
            ],
            gas: DEPOSIT_FOR_BURN_GAS_LIMIT,
          });
      console.log("[CCTP]", usedForwarding ? "depositForBurnWithHook()" : "depositForBurn()", "submitted:", hash);

      setConfirming(true);
      const receipt = await waitForReceiptRobust(publicClient, hash);
      console.log("[CCTP] burn confirmed in block", receipt.blockNumber, "status:", receipt.status);

      return { hash, destinationDomain, usedForwarding, irisEmpty };
    } catch (err: any) {
      console.error("[CCTP] sendCrossChain failed:", err);
      setError(describeConfirmError(err, "Cross-chain send failed"));
      return null;
    } finally {
      setBusy(false);
      setConfirming(false);
      setStep(null);
    }
  }

  return { sendCrossChain, busy, confirming, step, error };
}
