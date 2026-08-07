import { createPublicClient, http, getAddress, decodeEventLog, parseUnits } from "viem";
import type { Address, Log } from "viem";

/**
 * Arc Testnet chain definition + a viem public client, mirroring
 * app/src/lib/constants.ts's `arcTestnet` (kept as a small standalone copy
 * here rather than sharing code across the two workspaces).
 */
const arcTestnet = {
  id: Number(process.env.ARC_CHAIN_ID || 5042002),
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 },
  rpcUrls: {
    default: { http: [process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network"] },
  },
} as const;

export const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(),
});

/** Minimal ERC20 ABI — just enough to decode a Transfer event out of a receipt's logs. */
const erc20Abi = [
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
  },
] as const;

/** Minimal P2PEscrow ABI — just the `treasury()` getter, used to fetch the live payout address on-chain. */
const p2pEscrowAbi = [
  {
    type: "function",
    name: "treasury",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

/** Token registry — addresses/decimals mirror app/src/lib/constants.ts's TOKENS. */
const TOKENS: Record<string, { address: Address; decimals: number }> = {
  USDC: { address: getAddress("0x3600000000000000000000000000000000000000"), decimals: 6 },
  EURC: { address: getAddress("0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a"), decimals: 6 },
  cirBTC: { address: getAddress("0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF"), decimals: 8 },
};

let cachedTreasury: { address: Address; fetchedAt: number } | null = null;
const TREASURY_CACHE_MS = 60_000;

/** Reads the current treasury payout address straight from the P2PEscrow contract (with a short cache). */
async function getTreasuryAddress(): Promise<Address> {
  if (process.env.TREASURY_ADDRESS) {
    return getAddress(process.env.TREASURY_ADDRESS);
  }

  if (cachedTreasury && Date.now() - cachedTreasury.fetchedAt < TREASURY_CACHE_MS) {
    return cachedTreasury.address;
  }

  const escrowAddress = process.env.P2P_ESCROW_ADDRESS;
  if (!escrowAddress) {
    throw new Error("Neither TREASURY_ADDRESS nor P2P_ESCROW_ADDRESS is configured");
  }

  const treasury = (await publicClient.readContract({
    address: getAddress(escrowAddress),
    abi: p2pEscrowAbi,
    functionName: "treasury",
  })) as Address;

  cachedTreasury = { address: treasury, fetchedAt: Date.now() };
  return treasury;
}

function decodeTransferLog(log: Log): { from: Address; to: Address; value: bigint } | null {
  try {
    const decoded = decodeEventLog({ abi: erc20Abi, data: log.data, topics: log.topics, eventName: "Transfer" });
    return { from: decoded.args.from, to: decoded.args.to, value: decoded.args.value };
  } catch {
    return null;
  }
}

export interface VerifyTopupPaymentInput {
  txHash: `0x${string}`;
  tokenSymbol: string;
  /** Total amount (fee-inclusive) the frontend charged, in the token's smallest units, as a string. */
  tokenAmount: string;
}

export interface VerifiedPayment {
  ok: true;
  payer: Address;
}

export class TopupVerificationError extends Error {}

/**
 * Verifies, directly against Arc Testnet via viem, that `txHash` is a
 * confirmed ERC20 transfer of at least `tokenAmount` of `tokenSymbol` to the
 * live treasury address. This is what stands between "a user typed some
 * hash into the request body" and "Reloadly actually gets called" — no
 * on-chain confirmation, no top-up, regardless of what the request claims.
 */
export async function verifyTopupPayment(input: VerifyTopupPaymentInput): Promise<VerifiedPayment> {
  const token = TOKENS[input.tokenSymbol];
  if (!token) {
    throw new TopupVerificationError(`Unsupported token: ${input.tokenSymbol}`);
  }

  let expectedAmount: bigint;
  try {
    expectedAmount = BigInt(input.tokenAmount);
  } catch {
    throw new TopupVerificationError("tokenAmount must be an integer string of smallest-unit token amount");
  }
  if (expectedAmount <= 0n) {
    throw new TopupVerificationError("tokenAmount must be greater than zero");
  }

  const receipt = await publicClient.getTransactionReceipt({ hash: input.txHash }).catch(() => null);
  if (!receipt) {
    throw new TopupVerificationError("Transaction not found on Arc Testnet (not mined yet, or wrong hash)");
  }
  if (receipt.status !== "success") {
    throw new TopupVerificationError("Transaction reverted on-chain");
  }

  const treasury = await getTreasuryAddress();

  let matchedPayer: Address | null = null;
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== token.address.toLowerCase()) continue;
    const decoded = decodeTransferLog(log);
    if (decoded && decoded.to.toLowerCase() === treasury.toLowerCase() && decoded.value >= expectedAmount) {
      matchedPayer = decoded.from;
      break;
    }
  }

  if (!matchedPayer) {
    throw new TopupVerificationError(
      `On-chain transaction does not contain a ${input.tokenSymbol} transfer of at least the expected amount to the treasury`
    );
  }

  return { ok: true, payer: matchedPayer };
}

// Re-exported for callers that only need to build a comparable smallest-unit
// amount from a human-readable one (e.g. tests or future server-side checks).
export { parseUnits };
