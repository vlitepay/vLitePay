import { NextRequest, NextResponse } from "next/server";
import {
  readOffersFromChain,
  readTradesFromChain,
  readDisputesFromChain,
  readMerchantApplicationsFromChain,
} from "@/lib/indexer-chain-reader";
import { upsertOffer, upsertTrade, upsertDispute, upsertMerchantApplication } from "@/lib/supabase-indexer";

/**
 * POST /api/admin/index-sync
 *
 * FOUNDATION STUB — not a production indexer. This is a manually-triggered,
 * stateless, idempotent sync: on each call, it re-reads current on-chain
 * state (same scan-limited ranges the frontend hooks already use) and
 * upserts everything into the p2p_offers/p2p_trades/p2p_disputes/
 * p2p_merchant_applications tables. Calling it twice in a row is always
 * safe — every write is an upsert keyed on the on-chain id.
 *
 * NOT WIRED INTO ANY FRONTEND UI YET. Trigger it manually for now:
 *   curl -X POST http://localhost:3000/api/admin/index-sync \
 *     -H "x-indexer-secret: $INDEXER_SYNC_SECRET"
 *
 * HOW A REAL WORKER WOULD REPLACE THIS (next step after this foundation):
 *   - A real indexer would listen to P2PEscrow's events in real time
 *     (OfferCreated, TradeLocked, TradeReleased, DisputeRaised,
 *     MerchantApplied, etc. — see lib/abi/p2pEscrow.ts) via a websocket
 *     provider or a polling cron job, calling the SAME upsert functions
 *     in lib/supabase-indexer.ts for just the one row that changed,
 *     instead of re-scanning a whole range on every run.
 *   - It would also track a "last processed block" bookmark (e.g. a small
 *     `indexer_state` table) so it never reprocesses the same event twice
 *     and can resume after a restart — this stub has no such bookmark; it
 *     simply re-reads the same bounded scan window every time it's called.
 *   - Merchant application discovery replays the `MerchantApplied` event
 *     log within a bounded recent window (see
 *     lib/indexer-chain-reader.ts's INDEXER_FROM_BLOCK/
 *     INDEXER_LOG_SCAN_BLOCKS) rather than scanning from block 0, which
 *     Arc's public testnet RPC rejects outright (pruned history). A real
 *     worker listening to events live wouldn't need this replay at all.
 *   - Dispute `raised_by` is currently approximated as the trade's
 *     cryptoBuyer (see lib/indexer-chain-reader.ts) since getTrade's
 *     struct doesn't carry who raised the dispute — a real worker
 *     listening to the actual `DisputeRaised` event (which does carry
 *     the raiser's address) would populate this correctly.
 *
 * Optional lightweight protection: if INDEXER_SYNC_SECRET is set, the
 * caller must send it via the x-indexer-secret header. If the env var
 * isn't set, this check is skipped entirely (safe default for local/dev —
 * the data being written is all public on-chain data anyway, so the only
 * real risk of leaving this open is wasted RPC calls from being spammed,
 * not a data-integrity or privacy issue).
 */
export async function POST(req: NextRequest) {
  const requiredSecret = process.env.INDEXER_SYNC_SECRET;
  if (requiredSecret && req.headers.get("x-indexer-secret") !== requiredSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results: {
    offers: { synced: number; failed: number; error?: string };
    trades: { synced: number; failed: number; error?: string };
    disputes: { synced: number; failed: number; error?: string };
    merchantApplications: { synced: number; failed: number; error?: string };
  } = {
    offers: { synced: 0, failed: 0 },
    trades: { synced: 0, failed: 0 },
    disputes: { synced: 0, failed: 0 },
    merchantApplications: { synced: 0, failed: 0 },
  };

  // Each phase is independently try/caught — a failure in one (e.g. a
  // pruned-history log-scan error, or a transient RPC hiccup) must never
  // prevent the others from running or upserting whatever they already
  // successfully read. Previously this was one large try/catch around all
  // four phases, so a single failure aborted everything after it and
  // returned a blanket 500 even when earlier phases had fully succeeded.

  try {
    const offers = await readOffersFromChain();
    for (const offer of offers) {
      const ok = await upsertOffer(offer);
      ok ? results.offers.synced++ : results.offers.failed++;
    }
  } catch (err) {
    results.offers.error = err instanceof Error ? err.message : "Offers sync failed";
    console.error("[index-sync] offers phase failed:", err);
  }

  try {
    const trades = await readTradesFromChain();
    for (const trade of trades) {
      const ok = await upsertTrade(trade);
      ok ? results.trades.synced++ : results.trades.failed++;
    }
  } catch (err) {
    results.trades.error = err instanceof Error ? err.message : "Trades sync failed";
    console.error("[index-sync] trades phase failed:", err);
  }

  try {
    const disputes = await readDisputesFromChain();
    for (const dispute of disputes) {
      const ok = await upsertDispute(dispute);
      ok ? results.disputes.synced++ : results.disputes.failed++;
    }
  } catch (err) {
    results.disputes.error = err instanceof Error ? err.message : "Disputes sync failed";
    console.error("[index-sync] disputes phase failed:", err);
  }

  try {
    // readMerchantApplicationsFromChain already catches its own errors
    // internally (returns [] rather than throwing) — this try/catch is
    // defense in depth, not the only thing standing between a log-scan
    // failure and the rest of the sync.
    const applications = await readMerchantApplicationsFromChain();
    for (const application of applications) {
      const ok = await upsertMerchantApplication(application);
      ok ? results.merchantApplications.synced++ : results.merchantApplications.failed++;
    }
  } catch (err) {
    results.merchantApplications.error = err instanceof Error ? err.message : "Merchant applications sync failed";
    console.error("[index-sync] merchant applications phase failed:", err);
  }

  const anyPhaseErrored = Object.values(results).some((r) => r.error);

  return NextResponse.json({ ok: !anyPhaseErrored, results });
}
