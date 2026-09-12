import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, type Chain } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { sepolia, avalancheFuji, arbitrumSepolia, baseSepolia } from "viem/chains";
import { messageTransmitterAbi } from "@/lib/abi/messageTransmitter";
import { CCTP_DOMAIN } from "@/lib/cctp";

/**
 * POST /api/cctp/relay
 * Body: { burnTxHash: `0x${string}`, destinationDomain: number }
 *
 * Fallback path only — used when Circle's Forwarding Service wasn't used
 * for a given burn (e.g. Iris had no fee quote for Arc at burn time). This
 * route polls Iris for the burn's attestation, then submits
 * MessageTransmitter.receiveMessage on the destination chain itself, using
 * a server-held private key. Never runs client-side; the key never leaves
 * this file.
 *
 * Response is always one of:
 *   { status: "not_configured", error }  — this destination chain's RPC/
 *     contract address/relayer key isn't set in env; nothing was attempted.
 *   { status: "iris_empty" }             — Circle's Iris API has nothing
 *     for this burn tx yet on this domain — never faked as pending/minted.
 *   { status: "pending" }                — Circle has the message but
 *     hasn't attested it yet; poll again later.
 *   { status: "already_minted" }         — receiveMessage reverted because
 *     someone (Circle's own forwarder, or a previous call to this route)
 *     already minted it. Not a failure.
 *   { status: "minted", destTxHash }     — this call successfully minted
 *     it just now; destTxHash is real and confirmed.
 *   { status: "error", error }           — something else went wrong.
 */

const DEST_CHAIN_CONFIG: Record<
  number,
  { rpcEnvVar: string; messageTransmitterEnvVar: string; viemChain: Chain; label: string }
> = {
  [CCTP_DOMAIN.ethereum]: {
    rpcEnvVar: "ETHEREUM_SEPOLIA_RPC_URL",
    messageTransmitterEnvVar: "ETHEREUM_SEPOLIA_MESSAGE_TRANSMITTER_ADDRESS",
    viemChain: sepolia,
    label: "Ethereum Sepolia",
  },
  [CCTP_DOMAIN.avalanche]: {
    rpcEnvVar: "AVALANCHE_FUJI_RPC_URL",
    messageTransmitterEnvVar: "AVALANCHE_FUJI_MESSAGE_TRANSMITTER_ADDRESS",
    viemChain: avalancheFuji,
    label: "Avalanche Fuji",
  },
  [CCTP_DOMAIN.arbitrum]: {
    rpcEnvVar: "ARBITRUM_SEPOLIA_RPC_URL",
    messageTransmitterEnvVar: "ARBITRUM_SEPOLIA_MESSAGE_TRANSMITTER_ADDRESS",
    viemChain: arbitrumSepolia,
    label: "Arbitrum Sepolia",
  },
  [CCTP_DOMAIN.base]: {
    rpcEnvVar: "BASE_SEPOLIA_RPC_URL",
    messageTransmitterEnvVar: "BASE_SEPOLIA_MESSAGE_TRANSMITTER_ADDRESS",
    viemChain: baseSepolia,
    label: "Base Sepolia",
  },
};

const IRIS_API_BASE = process.env.NEXT_PUBLIC_IRIS_API_URL || "https://iris-api-sandbox.circle.com";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const { burnTxHash, destinationDomain } = body ?? {};

  if (!burnTxHash || typeof burnTxHash !== "string") {
    return NextResponse.json({ status: "error", error: "burnTxHash required." }, { status: 400 });
  }
  if (typeof destinationDomain !== "number" || !DEST_CHAIN_CONFIG[destinationDomain]) {
    return NextResponse.json({ status: "error", error: "Unsupported destinationDomain." }, { status: 400 });
  }

  const config = DEST_CHAIN_CONFIG[destinationDomain];
  const rpcUrl = process.env[config.rpcEnvVar];
  const messageTransmitterAddress = process.env[config.messageTransmitterEnvVar];
  const relayerKey = process.env.CCTP_RELAYER_PRIVATE_KEY;

  if (!rpcUrl || !messageTransmitterAddress || !relayerKey) {
    return NextResponse.json(
      {
        status: "not_configured",
        error: `CCTP relay isn't configured for ${config.label} yet — set ${config.rpcEnvVar}, ${config.messageTransmitterEnvVar}, and CCTP_RELAYER_PRIVATE_KEY.`,
      },
      { status: 501 }
    );
  }

  // Step 1: ask Iris for the attestation. Domain is always 26 (Arc) — this
  // route only ever relays FROM Arc.
  let messageStatus: { status: string; message?: string; attestation?: string };
  try {
    const res = await fetch(`${IRIS_API_BASE}/v2/messages/${CCTP_DOMAIN.arc}?transactionHash=${burnTxHash}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return NextResponse.json({ status: "error", error: `Iris returned ${res.status}` }, { status: 502 });
    }
    const data = await res.json();
    const entries = Array.isArray(data?.messages) ? data.messages : Array.isArray(data) ? data : [];
    if (entries.length === 0) {
      // Never fake success — Arc (domain 26) is a newer CCTP domain and
      // Iris has genuinely returned nothing for it before.
      return NextResponse.json({ status: "iris_empty" });
    }
    const entry = entries[0];
    const rawStatus = String(entry?.status ?? "").toLowerCase();
    if (rawStatus !== "complete" || !entry?.attestation) {
      return NextResponse.json({ status: "pending" });
    }
    messageStatus = { status: "complete", message: entry.message, attestation: entry.attestation };
  } catch (err) {
    return NextResponse.json(
      { status: "error", error: err instanceof Error ? err.message : "Could not reach Iris." },
      { status: 502 }
    );
  }

  // Step 2: submit receiveMessage on the destination chain.
  try {
    const account = privateKeyToAccount(relayerKey as `0x${string}`);
    const publicClient = createPublicClient({ chain: config.viemChain, transport: http(rpcUrl) });
    const walletClient = createWalletClient({ account, chain: config.viemChain, transport: http(rpcUrl) });

    const hash = await walletClient.writeContract({
      address: messageTransmitterAddress as `0x${string}`,
      abi: messageTransmitterAbi,
      functionName: "receiveMessage",
      args: [messageStatus.message as `0x${string}`, messageStatus.attestation as `0x${string}`],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 90_000 });
    if (receipt.status !== "success") {
      return NextResponse.json({ status: "error", error: "receiveMessage transaction reverted." }, { status: 502 });
    }

    return NextResponse.json({ status: "minted", destTxHash: hash });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // CCTP's MessageTransmitter reverts with a "nonce already used"-shaped
    // error once a message has already been minted — by Circle's own
    // Forwarding Service, or a previous call to this same route. That's
    // success, just not success WE caused, so we can't report a destTxHash
    // for it.
    if (/already.?(used|processed|minted)|nonce/i.test(message)) {
      return NextResponse.json({ status: "already_minted" });
    }
    console.error("[cctp/relay] receiveMessage failed:", message);
    return NextResponse.json({ status: "error", error: message }, { status: 502 });
  }
}
