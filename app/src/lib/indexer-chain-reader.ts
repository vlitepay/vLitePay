import "server-only";
import { createPublicClient, http } from "viem";
import { arcTestnet, CONTRACTS, TOKENS, TokenSymbol, OFFER_SCAN_LIMIT, TRADE_SCAN_LIMIT } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";

/**
 * SERVER-ONLY. Reads current P2PEscrow state directly from the chain, for
 * app/api/admin/index-sync/route.ts to upsert into Supabase.
 *
 * Deliberately mirrors the exact scan patterns already proven in the
 * frontend hooks — same scan limits (OFFER_SCAN_LIMIT/TRADE_SCAN_LIMIT),
 * same "nextId then scan backwards" shape as useOffers.ts/
 * useDisputedTrades.ts — rather than inventing a different discovery
 * strategy server-side. Merchant applications still replay the
 * `MerchantApplied` event log (same as useMerchantApplications.ts), but
 * NEVER from block 0 — Arc's public testnet RPC prunes history and
 * rejects that outright ("pruned history unavailable"). See
 * readMerchantApplicationsFromChain below for the bounded-window fix
 * (INDEXER_FROM_BLOCK / INDEXER_LOG_SCAN_BLOCKS) and its own try/catch, so
 * a log-scan failure here can never take down offers/trades syncing.
 *
 * Same Arc Testnet publicClient construction already used in
 * lib/verify-trade-participant.ts, kept as its own instance here rather
 * than importing (that file doesn't export its client) — avoids touching
 * an already-working file for an unrelated feature.
 */

const ARC_RPC_URL =
  process.env.ARC_RPC_URL || process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.network";

const publicClient = createPublicClient({
  chain: arcTestnet,
  transport: http(ARC_RPC_URL),
});

const symbolByAddress: Record<string, TokenSymbol> = Object.fromEntries(
  (Object.keys(TOKENS) as TokenSymbol[]).map((s) => [TOKENS[s].address.toLowerCase(), s])
);

export async function readOffersFromChain() {
  if (!CONTRACTS.p2pEscrow) return [];

  const nextId = Number(
    await publicClient.readContract({
      address: CONTRACTS.p2pEscrow,
      abi: p2pEscrowAbi,
      functionName: "nextOfferId",
    })
  );

  const scanFrom = Math.max(1, nextId - OFFER_SCAN_LIMIT);
  const ids = Array.from({ length: Math.max(0, nextId - scanFrom) }, (_, i) => scanFrom + i);
  if (ids.length === 0) return [];

  const results = await publicClient.multicall({
    contracts: ids.map((id) => ({
      address: CONTRACTS.p2pEscrow,
      abi: p2pEscrowAbi,
      functionName: "getOffer" as const,
      args: [BigInt(id)] as const,
    })),
  });

  return results
    .map((r) => (r.status === "success" ? (r.result as any) : null))
    .filter(Boolean)
    .map((o: any) => ({
      offer_id: o.id.toString(),
      merchant_address: o.merchant as string,
      side: Number(o.side),
      token_address: o.token as string,
      token_symbol: symbolByAddress[(o.token as string).toLowerCase()] ?? "USDC",
      fiat_currency: o.fiatCurrency as string,
      rate: o.rate.toString(),
      min_amount: o.minAmount.toString(),
      max_amount: o.maxAmount.toString(),
      terms: o.terms as string,
      active: o.active as boolean,
      paused: o.paused as boolean,
      views: o.views.toString(),
      trades_count: o.tradesCount.toString(),
      volume: o.volume.toString(),
      created_at_chain: o.createdAt.toString(),
    }));
}

export async function readTradesFromChain() {
  if (!CONTRACTS.p2pEscrow) return [];

  const nextId = Number(
    await publicClient.readContract({
      address: CONTRACTS.p2pEscrow,
      abi: p2pEscrowAbi,
      functionName: "nextTradeId",
    })
  );

  const scanFrom = Math.max(1, nextId - TRADE_SCAN_LIMIT);
  const ids = Array.from({ length: Math.max(0, nextId - scanFrom) }, (_, i) => scanFrom + i);
  if (ids.length === 0) return [];

  const results = await publicClient.multicall({
    contracts: ids.map((id) => ({
      address: CONTRACTS.p2pEscrow,
      abi: p2pEscrowAbi,
      functionName: "getTrade" as const,
      args: [BigInt(id)] as const,
    })),
  });

  return results
    .map((r) => (r.status === "success" ? (r.result as any) : null))
    .filter(Boolean)
    .map((t: any) => ({
      trade_id: t.id.toString(),
      offer_id: t.offerId.toString(),
      token_address: t.token as string,
      token_symbol: symbolByAddress[(t.token as string).toLowerCase()] ?? "USDC",
      amount: t.amount.toString(),
      maker_fee_amount: t.makerFeeAmount.toString(),
      taker_fee_amount: t.takerFeeAmount.toString(),
      crypto_buyer: t.cryptoBuyer as string,
      crypto_seller: t.cryptoSeller as string,
      fiat_amount: t.fiatAmount.toString(),
      fiat_currency: t.fiatCurrency as string,
      status: Number(t.status),
      locked_at: t.lockedAt.toString(),
      timer_duration: t.timerDuration.toString(),
      fiat_marked_at: t.fiatMarkedAt.toString(),
      dispute_raised: t.disputeRaised as boolean,
      evidence_uri: t.evidenceURI as string,
    }));
}

/** Disputes aren't a separate on-chain entity — same as
 * hooks/useDisputedTrades.ts, derived by filtering trades for
 * disputeRaised/status. Reuses readTradesFromChain rather than a second
 * scan. */
export async function readDisputesFromChain() {
  const trades = await readTradesFromChain();
  return trades
    .filter((t) => t.dispute_raised)
    .map((t) => ({
      trade_id: t.trade_id,
      offer_id: t.offer_id,
      raised_by: t.crypto_buyer, // best-effort — DisputeRaised's `by` isn't captured in the current getTrade struct; refine once a real event-driven worker exists (see route.ts comments)
      evidence_uri: t.evidence_uri,
      status: t.status,
    }));
}

/**
 * How far back MerchantApplied is scanned when INDEXER_FROM_BLOCK isn't
 * set — Arc's public testnet RPC prunes history, so `fromBlock: 0n` (the
 * original approach, mirroring useMerchantApplications.ts) fails outright
 * with "pruned history unavailable" rather than just being slow. A bounded
 * recent window avoids that failure mode entirely, at the cost of only
 * seeing applicants from within this window — set INDEXER_FROM_BLOCK to a
 * real, known deployment/genesis-adjacent block once you have one, to scan
 * the full real history instead of a rolling window.
 */
const DEFAULT_LOG_SCAN_BLOCKS = 50_000n;

export async function readMerchantApplicationsFromChain() {
  if (!CONTRACTS.p2pEscrow) return [];

  try {
    const fromBlockEnv = process.env.INDEXER_FROM_BLOCK;
    let fromBlock: bigint;

    if (fromBlockEnv) {
      // Explicit absolute starting block — e.g. P2PEscrow's actual
      // deployment block, once known. Takes priority over the rolling
      // window below.
      fromBlock = BigInt(fromBlockEnv);
    } else {
      const latestBlock = await publicClient.getBlockNumber();
      const scanBlocks = process.env.INDEXER_LOG_SCAN_BLOCKS
        ? BigInt(process.env.INDEXER_LOG_SCAN_BLOCKS)
        : DEFAULT_LOG_SCAN_BLOCKS;
      fromBlock = latestBlock > scanBlocks ? latestBlock - scanBlocks : 0n;
    }

    const logs = await publicClient.getContractEvents({
      address: CONTRACTS.p2pEscrow,
      abi: p2pEscrowAbi,
      eventName: "MerchantApplied",
      fromBlock,
      toBlock: "latest",
    });

    const applicants = Array.from(new Set(logs.map((l: any) => l.args.applicant as string)));
    if (applicants.length === 0) return [];

    const results = await publicClient.multicall({
      contracts: applicants.flatMap((addr) => [
        { address: CONTRACTS.p2pEscrow, abi: p2pEscrowAbi, functionName: "isPendingMerchant" as const, args: [addr as `0x${string}`] },
        { address: CONTRACTS.p2pEscrow, abi: p2pEscrowAbi, functionName: "isApprovedMerchant" as const, args: [addr as `0x${string}`] },
      ]),
    });

    return applicants.map((address, i) => ({
      wallet_address: address,
      is_pending: results[i * 2]?.status === "success" ? (results[i * 2].result as boolean) : false,
      is_approved: results[i * 2 + 1]?.status === "success" ? (results[i * 2 + 1].result as boolean) : false,
    }));
  } catch (err) {
    // getContractEvents can still fail for reasons beyond fromBlock=0
    // (RPC rate limits, a window that's still too large for this
    // provider, transient network errors, etc.) — never let a log-scan
    // failure here take down the whole sync route. Offers/trades/disputes
    // (plain contract reads, not log scans) are unaffected either way.
    console.warn("[indexer-chain-reader] readMerchantApplicationsFromChain failed:", err instanceof Error ? err.message : err);
    return [];
  }
}
