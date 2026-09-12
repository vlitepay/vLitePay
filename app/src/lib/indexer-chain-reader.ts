import "server-only";
import { createPublicClient, http } from "viem";
import type { SupabaseClient } from "@supabase/supabase-js";
import { arcTestnet, CONTRACTS, TOKENS, TokenSymbol, OFFER_SCAN_LIMIT, TRADE_SCAN_LIMIT } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { OfferRowInput, TradeRowInput, DisputeRowInput, DepositRowInput } from "@/lib/supabase-indexer";

/**
 * SERVER-ONLY. Reads current P2PEscrow state directly from the chain, for
 * app/api/admin/index-sync/route.ts to upsert into Supabase.
 *
 * Deliberately mirrors the exact scan patterns already proven in the
 * frontend hooks — same scan limits (OFFER_SCAN_LIMIT/TRADE_SCAN_LIMIT),
 * same "nextId then scan backwards" shape as useOffers.ts/
 * useDisputedTrades.ts — rather than inventing a different discovery
 * strategy server-side. Merchant applications, P2P lifecycle events, and
 * incoming deposits all replay event logs (see scanEventLogs below) —
 * NEVER from block 0 (Arc's public testnet RPC prunes history and rejects
 * that outright), and each keeps its own persisted cursor (indexer_cursor
 * table) so every sync run scans forward from where the last one left
 * off, rather than rescanning a broad window every time. Each log scan
 * has its own try/catch, so a scan failure here can never take down
 * offers/trades syncing.
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

function mapOfferResult(o: any): OfferRowInput {
  return {
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
  };
}

function mapTradeResult(t: any): TradeRowInput {
  return {
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
  };
}

/** Fetches specific offer ids directly (not windowed by OFFER_SCAN_LIMIT) — used by readP2PLifecycleEventsFromChain so an event about an old offer id still gets synced correctly even if it's fallen outside the scan window. */
async function readOffersByIds(ids: number[]): Promise<OfferRowInput[]> {
  if (!CONTRACTS.p2pEscrow || ids.length === 0) return [];
  const results = await publicClient.multicall({
    contracts: ids.map((id) => ({
      address: CONTRACTS.p2pEscrow,
      abi: p2pEscrowAbi,
      functionName: "getOffer" as const,
      args: [BigInt(id)] as const,
    })),
  });
  return results
    .map((r) => (r.status === "success" ? mapOfferResult(r.result as any) : null))
    .filter((o): o is OfferRowInput => o !== null);
}

/** Same idea as readOffersByIds, for trades. */
async function readTradesByIds(ids: number[]): Promise<TradeRowInput[]> {
  if (!CONTRACTS.p2pEscrow || ids.length === 0) return [];
  const results = await publicClient.multicall({
    contracts: ids.map((id) => ({
      address: CONTRACTS.p2pEscrow,
      abi: p2pEscrowAbi,
      functionName: "getTrade" as const,
      args: [BigInt(id)] as const,
    })),
  });
  return results
    .map((r) => (r.status === "success" ? mapTradeResult(r.result as any) : null))
    .filter((t): t is TradeRowInput => t !== null);
}

export async function readOffersFromChain(): Promise<OfferRowInput[]> {
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
  return readOffersByIds(ids);
}

export async function readTradesFromChain(): Promise<TradeRowInput[]> {
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
  return readTradesByIds(ids);
}

/** Disputes aren't a separate on-chain entity — same as
 * hooks/useDisputedTrades.ts, derived by filtering trades for
 * disputeRaised/status. Reuses readTradesFromChain rather than a second
 * scan. Kept for the existing full-window sync phase in route.ts;
 * readP2PLifecycleEventsFromChain below gets the real raiser/arbiter
 * address directly from DisputeRaised/DisputeResolved instead of this
 * placeholder. */
export async function readDisputesFromChain(): Promise<DisputeRowInput[]> {
  const trades = await readTradesFromChain();
  return trades
    .filter((t) => t.dispute_raised)
    .map((t) => ({
      trade_id: t.trade_id,
      offer_id: t.offer_id,
      raised_by: t.crypto_buyer, // best-effort placeholder — see readP2PLifecycleEventsFromChain for the real address
      evidence_uri: t.evidence_uri,
      status: t.status,
    }));
}

/**
 * How far back a key's FIRST scan starts if it has no persisted cursor
 * yet (see scanEventLogs/readCursor below) and INDEXER_FROM_BLOCK isn't
 * set — Arc's public testnet RPC prunes history, so starting from block 0
 * fails outright with "pruned history unavailable" rather than just being
 * slow. Only relevant once per cursor key, ever — every run after a key's
 * first successful scan reads from its persisted cursor instead.
 */
const DEFAULT_LOG_SCAN_BLOCKS = 50_000n;

/**
 * Arc's public testnet RPC (rpc.testnet.arc.network) is considerably
 * stricter than "requested range too large" alone suggested: it accepted
 * ~100-block single-address, no-topic probes, but rejected both a
 * 2000-block window AND any request ORing multiple event signatures into
 * one topics[0] array ("multi-topic wide scans fail"), regardless of how
 * few blocks. So every log scan below now does two things differently
 * from before: (1) each eth_getLogs call spans at most this many blocks,
 * and (2) each call filters for exactly ONE event signature — never all
 * of an ABI's events combined into one filter (see the per-event-name
 * loops in readMerchantApplicationsFromChain / readP2PLifecycleEventsFromChain).
 * Default lowered from 100 to 10 — Alchemy's free tier caps eth_getLogs at
 * 10 blocks per call, and public RPCs reject wide ranges outright.
 */
const DEFAULT_LOG_CHUNK_BLOCKS = 10n;

function resolveLogChunkSize(): bigint {
  const raw = process.env.INDEXER_LOG_SCAN_BLOCKS;
  const parsed = raw !== undefined ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? BigInt(parsed) : DEFAULT_LOG_CHUNK_BLOCKS;
}

async function resolveLatestBlock(): Promise<bigint> {
  return publicClient.getBlockNumber();
}

/**
 * Persistent per-scan-stream cursor (table: indexer_cursor — see
 * supabase/indexer_cursor.sql). Each distinct event scan (one per event
 * name per reader — e.g. "merchant:MerchantApplied", "p2p:TradeLocked",
 * "deposit:USDC") gets its own row, so one key's failure never blocks
 * another's progress. INDEXER_FROM_BLOCK is ONLY consulted when a key has
 * no cursor row yet (first run for that key) — every run after that reads
 * `last_block + 1`, regardless of what INDEXER_FROM_BLOCK is set to.
 * Supabase not configured (no service-role key) degrades safely: every
 * run behaves like a first run (INDEXER_FROM_BLOCK / rolling-window
 * fallback), same as before this cursor existed.
 */
function untypedAdmin(): SupabaseClient | null {
  const admin = getSupabaseAdmin();
  return admin ? (admin as unknown as SupabaseClient) : null;
}

async function readCursor(key: string): Promise<bigint | null> {
  const admin = untypedAdmin();
  if (!admin) return null;
  try {
    const { data, error } = await admin.from("indexer_cursor").select("last_block").eq("id", key).maybeSingle();
    if (error || !data) return null;
    return BigInt((data as any).last_block);
  } catch (err) {
    console.warn(`[indexer-chain-reader] readCursor(${key}) failed:`, err instanceof Error ? err.message : err);
    return null;
  }
}

async function writeCursor(key: string, lastBlock: bigint): Promise<void> {
  const admin = untypedAdmin();
  if (!admin) return;
  try {
    const { error } = await admin
      .from("indexer_cursor")
      .upsert({ id: key, last_block: lastBlock.toString(), updated_at: new Date().toISOString() }, { onConflict: "id" });
    if (error) console.warn(`[indexer-chain-reader] writeCursor(${key}) failed:`, error.message);
  } catch (err) {
    console.warn(`[indexer-chain-reader] writeCursor(${key}) threw:`, err instanceof Error ? err.message : err);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface FailedBlockRange {
  fromBlock: string;
  toBlock: string;
}

/** A genuinely bad request (bad address, bad ABI, etc.) would fail identically at any window size, so only range/timeout-shaped errors trigger the halving retry. */
const RANGE_ERROR_PATTERN = /range|too large|timeout|timed out/i;
/** Arc's public RPC's rate-limit signature — checked separately from range errors since it gets its own (non-halving) retry policy. */
const RATE_LIMIT_ERROR_PATTERN = /rate.?limit|-32005|\b429\b/i;

/** Baseline pause between every eth_getLogs call, successful or not — proactive throttling, not just reactive retry-on-failure. */
const INTER_CALL_SLEEP_MS = 400;
/** Wait before the single rate-limit retry, per chunk. */
const RATE_LIMIT_RETRY_DELAY_MS = 2000;

/**
 * Fetches logs for exactly ONE event (never a multi-event OR'd topics
 * filter — see DEFAULT_LOG_CHUNK_BLOCKS's comment) starting from
 * `cursorKey`'s persisted cursor (or INDEXER_FROM_BLOCK / a rolling
 * window, if this key has never been scanned before) through
 * `toBlockNumber`, walking it in chunkSize-block windows.
 *
 * Per window:
 *  - A rate-limit-shaped error (429 / -32005 / "rate limit") waits 2s and
 *    retries the SAME window once, at the SAME size (no halving — the
 *    problem is call frequency, not window size). A second consecutive
 *    rate-limit (or any other error on that retry) is treated as
 *    permanent for this run.
 *  - A range/timeout-shaped error halves the window and retries from the
 *    SAME start — never skipped — until it succeeds or has shrunk to a
 *    single block.
 *  - Any error that's still failing after the above (including a single
 *    block that still fails) is logged and recorded in `failedRanges`,
 *    and — unlike before this cursor existed — THIS KEY'S WALK STOPS
 *    HERE for this run entirely, rather than continuing past the gap.
 *    That's deliberate: continuing would mean firing more requests at an
 *    RPC that's already told us it's rate-limiting or struggling, which
 *    risks making things worse, and it's unnecessary anyway — the cursor
 *    is only advanced up to the last successful window, so the very next
 *    sync run picks up exactly where this one stopped, retrying the
 *    failed window first rather than skipping past it.
 *
 * Nothing here ever throws — one bad window/chunk can't abort the rest of
 * the calling reader or the sync route.
 */
async function scanEventLogs(params: {
  cursorKey: string;
  address: `0x${string}`;
  abi: readonly unknown[];
  eventName: string;
  toBlockNumber: bigint;
}): Promise<{ logs: any[]; failedRanges: FailedBlockRange[] }> {
  const baseChunkSize = resolveLogChunkSize();
  const logs: any[] = [];
  const failedRanges: FailedBlockRange[] = [];

  const cursor = await readCursor(params.cursorKey);
  let start: bigint;
  if (cursor !== null) {
    start = cursor + 1n;
  } else {
    const fromBlockEnv = process.env.INDEXER_FROM_BLOCK;
    start = fromBlockEnv
      ? BigInt(fromBlockEnv)
      : params.toBlockNumber > DEFAULT_LOG_SCAN_BLOCKS
        ? params.toBlockNumber - DEFAULT_LOG_SCAN_BLOCKS
        : 0n;
  }

  if (start > params.toBlockNumber) {
    return { logs, failedRanges }; // already caught up — nothing new to scan
  }

  let highestSuccessful: bigint | null = null;

  while (start <= params.toBlockNumber) {
    let size = baseChunkSize > 0n ? baseChunkSize : 1n;
    let end = start;
    let succeeded = false;
    let rateLimitRetried = false;

    while (true) {
      end = start + size - 1n > params.toBlockNumber ? params.toBlockNumber : start + size - 1n;
      try {
        const chunkLogs = await publicClient.getContractEvents({
          address: params.address,
          abi: params.abi as any,
          eventName: params.eventName as any,
          fromBlock: start,
          toBlock: end,
        });
        logs.push(...chunkLogs);
        succeeded = true;
        await sleep(INTER_CALL_SLEEP_MS);
        break;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        if (RATE_LIMIT_ERROR_PATTERN.test(message) && !rateLimitRetried) {
          rateLimitRetried = true;
          console.warn(`[indexer-chain-reader] rate limited on ${params.cursorKey} ${start}-${end}, waiting 2s and retrying once`);
          await sleep(RATE_LIMIT_RETRY_DELAY_MS);
          continue; // retry the SAME window once, same size
        }

        if (RANGE_ERROR_PATTERN.test(message) && size > 1n) {
          size = size / 2n > 0n ? size / 2n : 1n;
          await sleep(INTER_CALL_SLEEP_MS);
          continue; // retry the SAME start with a smaller window
        }

        console.warn(
          `[indexer-chain-reader] getLogs ${params.cursorKey} ${start}-${end} failed permanently this run:`,
          message
        );
        failedRanges.push({ fromBlock: start.toString(), toBlock: end.toString() });
        await sleep(INTER_CALL_SLEEP_MS);
        break;
      }
    }

    if (!succeeded) break; // stop this key's walk — cursor freezes before this window

    highestSuccessful = end;
    start = end + 1n;
  }

  if (highestSuccessful !== null) {
    await writeCursor(params.cursorKey, highestSuccessful);
  }

  return { logs, failedRanges };
}

const MERCHANT_EVENT_NAMES = ["MerchantApplied", "MerchantApproved", "MerchantRejected"] as const;

export async function readMerchantApplicationsFromChain(): Promise<{
  rows: { wallet_address: string; is_pending: boolean; is_approved: boolean }[];
  failedRanges: FailedBlockRange[];
}> {
  if (!CONTRACTS.p2pEscrow) return { rows: [], failedRanges: [] };

  try {
    const toBlockNumber = await resolveLatestBlock();

    // One event name per request — never all three OR'd into a single
    // topics[0] filter (Arc's public RPC rejects multi-topic wide scans
    // even at a small block range). MerchantApproved/MerchantRejected
    // weren't previously read here at all; is_pending/is_approved were
    // only ever derived from the two view calls below regardless of which
    // event fired, so scanning for them is about explicit event-driven
    // coverage/audit trail, not a behavior change to the resulting rows.
    const failedRanges: FailedBlockRange[] = [];
    const addresses = new Set<string>();

    for (const eventName of MERCHANT_EVENT_NAMES) {
      const { logs, failedRanges: eventFailedRanges } = await scanEventLogs({
        cursorKey: `merchant:${eventName}`,
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi,
        eventName,
        toBlockNumber,
      });
      failedRanges.push(...eventFailedRanges);
      for (const log of logs as any[]) {
        if (eventName === "MerchantApproved") {
          addresses.add(log.args.merchant as string);
        } else {
          addresses.add(log.args.applicant as string);
        }
      }
    }

    const applicants = Array.from(addresses);
    if (applicants.length === 0) return { rows: [], failedRanges };

    const results = await publicClient.multicall({
      contracts: applicants.flatMap((addr) => [
        { address: CONTRACTS.p2pEscrow, abi: p2pEscrowAbi, functionName: "isPendingMerchant" as const, args: [addr as `0x${string}`] },
        { address: CONTRACTS.p2pEscrow, abi: p2pEscrowAbi, functionName: "isApprovedMerchant" as const, args: [addr as `0x${string}`] },
      ]),
    });

    const rows = applicants.map((address, i) => ({
      wallet_address: address,
      is_pending: results[i * 2]?.status === "success" ? (results[i * 2].result as boolean) : false,
      is_approved: results[i * 2 + 1]?.status === "success" ? (results[i * 2 + 1].result as boolean) : false,
    }));

    return { rows, failedRanges };
  } catch (err) {
    // Defense in depth beyond scanEventLogs's own per-window handling —
    // never let a log-scan failure here take down the whole sync route.
    // Offers/trades/disputes (plain contract reads, not log scans) are
    // unaffected either way.
    console.warn("[indexer-chain-reader] readMerchantApplicationsFromChain failed:", err instanceof Error ? err.message : err);
    return { rows: [], failedRanges: [] };
  }
}

/**
 * Event-driven persistence for the P2P offer/trade/dispute lifecycle —
 * OfferCreated, TradeLocked, FiatMarkedSent, TradeReleased,
 * TradeReleasedCrossChain, TradeCancelled, DisputeRaised, DisputeResolved.
 * Scans with the same per-key cursor mechanism as merchant applications
 * (see scanEventLogs) — one event name per scanEventLogs call each,
 * never all eight OR'd into a single topics[0] filter — collects which
 * offer/trade ids were touched, then re-fetches each one's CURRENT
 * authoritative state via getOffer/getTrade by its specific id
 * (readOffersByIds/readTradesByIds) — not the windowed nextId scan — so an
 * id outside OFFER_SCAN_LIMIT/TRADE_SCAN_LIMIT's window still gets synced
 * correctly if one of these events mentions it. Neither scan limit is
 * changed by this.
 *
 * Disputes get the REAL raiser/arbiter address straight from
 * DisputeRaised.by / DisputeResolved.arbiter — fixing the "best-effort"
 * crypto_buyer placeholder readDisputesFromChain above still uses for the
 * existing full-window phase.
 *
 * Never throws — same isolation pattern as readMerchantApplicationsFromChain,
 * so a log-scan failure here can't take down the rest of index-sync.
 */
const P2P_LIFECYCLE_EVENT_NAMES = [
  "OfferCreated",
  "TradeLocked",
  "FiatMarkedSent",
  "TradeReleased",
  "TradeReleasedCrossChain",
  "TradeCancelled",
  "DisputeRaised",
  "DisputeResolved",
] as const;

export async function readP2PLifecycleEventsFromChain(): Promise<{
  offers: OfferRowInput[];
  trades: TradeRowInput[];
  disputes: DisputeRowInput[];
  failedRanges: FailedBlockRange[];
}> {
  if (!CONTRACTS.p2pEscrow) return { offers: [], trades: [], disputes: [], failedRanges: [] };

  try {
    const toBlockNumber = await resolveLatestBlock();

    const offerIds = new Set<number>();
    const tradeIds = new Set<number>();
    // trade_id -> best-known real raiser/arbiter address for that dispute.
    // DisputeResolved (arbiter) is treated as more authoritative than
    // DisputeRaised (the original raiser) if both fire in the same
    // window, since resolution is the more recent/relevant identity for
    // the row's current state — either way status is refetched fresh below.
    const disputeRaiser = new Map<string, string>();
    const failedRanges: FailedBlockRange[] = [];

    for (const eventName of P2P_LIFECYCLE_EVENT_NAMES) {
      const { logs, failedRanges: eventFailedRanges } = await scanEventLogs({
        cursorKey: `p2p:${eventName}`,
        address: CONTRACTS.p2pEscrow,
        abi: p2pEscrowAbi,
        eventName,
        toBlockNumber,
      });
      failedRanges.push(...eventFailedRanges);

      for (const log of logs as any[]) {
        switch (log.eventName) {
          case "OfferCreated":
            offerIds.add(Number(log.args.offerId));
            break;
          case "TradeLocked":
            tradeIds.add(Number(log.args.tradeId));
            offerIds.add(Number(log.args.offerId)); // trades_count/volume on the offer change too
            break;
          case "FiatMarkedSent":
          case "TradeReleased":
          case "TradeReleasedCrossChain":
          case "TradeCancelled":
            tradeIds.add(Number(log.args.tradeId));
            break;
          case "DisputeRaised":
            tradeIds.add(Number(log.args.tradeId));
            if (!disputeRaiser.has(log.args.tradeId.toString())) {
              disputeRaiser.set(log.args.tradeId.toString(), log.args.by as string);
            }
            break;
          case "DisputeResolved":
            tradeIds.add(Number(log.args.tradeId));
            disputeRaiser.set(log.args.tradeId.toString(), log.args.arbiter as string);
            break;
          default:
            break;
        }
      }
    }

    const [offers, trades] = await Promise.all([
      readOffersByIds(Array.from(offerIds)),
      readTradesByIds(Array.from(tradeIds)),
    ]);

    const disputes: DisputeRowInput[] = trades
      .filter((t) => disputeRaiser.has(t.trade_id))
      .map((t) => ({
        trade_id: t.trade_id,
        offer_id: t.offer_id,
        raised_by: disputeRaiser.get(t.trade_id)!,
        evidence_uri: t.evidence_uri,
        status: t.status,
      }));

    return { offers, trades, disputes, failedRanges };
  } catch (err) {
    console.warn("[indexer-chain-reader] readP2PLifecycleEventsFromChain failed:", err instanceof Error ? err.message : err);
    return { offers: [], trades: [], disputes: [], failedRanges: [] };
  }
}

const erc20TransferEventAbi = [
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

/**
 * Persists confirmed incoming ERC-20 Transfer events (USDC/EURC/cirBTC
 * only) landing on a real user wallet — NOT outbound Send/Swap/Top Up
 * payments the user makes TO this app's own contracts. "Ours" is
 * everything in CONTRACTS plus P2PEscrow's own configured treasury()
 * address (a view call, not a static env var) — a transfer whose `to` is
 * any of those is an outbound payment already covered elsewhere, not a
 * deposit into the user's own wallet, so it's excluded here.
 *
 * Same per-key persisted cursor and rate-limit handling as merchant
 * applications/P2P events (see scanEventLogs), same never-throws
 * isolation. Already scans one event ("Transfer") per token address per
 * request — already compliant with the one-topic0-per-request rule.
 */
export async function readIncomingDepositsFromChain(): Promise<{
  rows: DepositRowInput[];
  failedRanges: FailedBlockRange[];
}> {
  try {
    const excluded = new Set(
      [CONTRACTS.p2pEscrow, CONTRACTS.sendWithFee, CONTRACTS.tokenMessenger, CONTRACTS.fxEscrow, CONTRACTS.permit2]
        .filter((a): a is `0x${string}` => !!a)
        .map((a) => a.toLowerCase())
    );

    if (CONTRACTS.p2pEscrow) {
      try {
        const treasury = await publicClient.readContract({
          address: CONTRACTS.p2pEscrow,
          abi: p2pEscrowAbi,
          functionName: "treasury",
        });
        if (treasury) excluded.add((treasury as string).toLowerCase());
      } catch {
        // treasury() unset/unreachable on this deployment — fine, just no exclusion for it.
      }
    }

    const toBlockNumber = await resolveLatestBlock();
    const failedRanges: FailedBlockRange[] = [];

    const perToken = await Promise.all(
      (Object.keys(TOKENS) as TokenSymbol[]).map(async (symbol) => {
        const address = TOKENS[symbol].address;
        if (!address) return [] as DepositRowInput[];

        const { logs, failedRanges: tokenFailedRanges } = await scanEventLogs({
          cursorKey: `deposit:${symbol}`,
          address,
          abi: erc20TransferEventAbi,
          eventName: "Transfer",
          toBlockNumber,
        });
        failedRanges.push(...tokenFailedRanges);

        return (logs as any[])
          .filter((l) => !excluded.has((l.args.to as string).toLowerCase()))
          .map(
            (l): DepositRowInput => ({
              tx_hash: l.transactionHash as string,
              log_index: Number(l.logIndex),
              token_address: address,
              token_symbol: symbol,
              from_address: l.args.from as string,
              to_address: l.args.to as string,
              amount: (l.args.value as bigint).toString(),
              block_number: (l.blockNumber as bigint).toString(),
            })
          );
      })
    );

    return { rows: perToken.flat(), failedRanges };
  } catch (err) {
    console.warn("[indexer-chain-reader] readIncomingDepositsFromChain failed:", err instanceof Error ? err.message : err);
    return { rows: [], failedRanges: [] };
  }
}
