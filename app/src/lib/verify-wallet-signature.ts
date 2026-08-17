import "server-only";
import { createPublicClient, http } from "viem";
import type { Address, Hex } from "viem";
import { arcTestnet } from "@/lib/constants";

/**
 * SERVER-ONLY signature verification helper. NOT called by any route yet —
 * this exists so the actual verification logic is written and reviewable
 * ahead of wiring it into app/api/profile/route.ts's POST handler.
 *
 * Confirms that `signature` is a valid personal_sign signature over
 * `message`, produced by `wallet`. This is the missing piece that makes
 * lib/supabase-profile-write.ts's upsertProfile() safe to call — without
 * this check, anything claiming to be a given wallet_address could
 * overwrite that wallet's profile, since there's no Supabase Auth session
 * to trust here (see lib/supabase.ts — persistSession: false).
 *
 * Uses viem's public-client `verifyMessage` action (not the bare pure-crypto
 * recovery helper) deliberately: this app's Circle Programmable Wallets
 * (lib/circleConnector.ts) are smart-contract wallets, not plain EOAs, so
 * verification must support EIP-1271 (an on-chain isValidSignature check)
 * as well as plain ECDSA — a pure/offline recovery check would silently
 * reject every valid Circle-wallet signature. That's why this needs an RPC
 * call, same Arc Testnet endpoint already used by app/api/rpc/route.ts and
 * lib/wagmi-config.ts.
 *
 * Deliberately returns a result object rather than throwing — a future
 * caller in the POST route can check `.valid` and respond 401 without a
 * try/catch, and `.error` gives a specific reason for logging without
 * necessarily leaking internals to the client.
 */
export interface VerifyWalletSignatureParams {
  wallet: Address | string;
  message: string;
  signature: Hex | string;
}

export interface VerifyWalletSignatureResult {
  valid: boolean;
  error?: string;
}

const ARC_RPC_URL =
  process.env.ARC_RPC_URL || process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.network";

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_RPC_URL),
});

export async function verifyWalletSignature({
  wallet,
  message,
  signature,
}: VerifyWalletSignatureParams): Promise<VerifyWalletSignatureResult> {
  if (!wallet || !message || !signature) {
    return { valid: false, error: "Missing wallet, message, or signature" };
  }

  try {
    const valid = await publicClient.verifyMessage({
      address: wallet as Address,
      message,
      signature: signature as Hex,
    });

    return valid ? { valid: true } : { valid: false, error: "Signature does not match wallet" };
  } catch (err) {
    return {
      valid: false,
      error: err instanceof Error ? err.message : "Signature verification failed",
    };
  }
}
