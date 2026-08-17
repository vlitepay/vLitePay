import "server-only";
import { createPublicClient, http } from "viem";
import { arcTestnet, CONTRACTS } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";

/**
 * SERVER-ONLY. Checks whether `walletAddress` is the on-chain buyer or
 * seller of `tradeId`, by reading the P2PEscrow contract's `getTrade`
 * (same struct fields — `cryptoBuyer`/`cryptoSeller` — hooks/useTrade.ts
 * already parses client-side). This is what gates access to a trade's
 * chat: chat_messages has no RLS policies at all (see the SQL migration),
 * so this check is the actual privacy boundary, not the database.
 *
 * Deliberately constructs its own publicClient rather than importing one
 * from lib/verify-wallet-signature.ts (that file doesn't export its
 * client) — same Arc Testnet RPC pattern, kept separate to avoid touching
 * an already-working file for an unrelated feature.
 *
 * Returns `false` on any failure (bad tradeId, RPC error, contract not
 * configured) — never throws, so callers can treat "not a participant"
 * and "couldn't verify" the same way: deny access.
 */

const ARC_RPC_URL =
  process.env.ARC_RPC_URL || process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.network";

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_RPC_URL),
});

export async function isTradeParticipant(tradeId: number | bigint, walletAddress: string): Promise<boolean> {
  if (!CONTRACTS.p2pEscrow || !walletAddress) return false;

  try {
    const trade = await publicClient.readContract({
      address: CONTRACTS.p2pEscrow,
      abi: p2pEscrowAbi,
      functionName: "getTrade",
      args: [BigInt(tradeId)],
    });

    const t = trade as { cryptoBuyer?: string; cryptoSeller?: string };
    const wallet = walletAddress.toLowerCase();

    return t.cryptoBuyer?.toLowerCase() === wallet || t.cryptoSeller?.toLowerCase() === wallet;
  } catch (err) {
    console.warn("[verify-trade-participant] check failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
