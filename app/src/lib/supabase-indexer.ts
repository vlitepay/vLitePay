import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * SERVER-ONLY upsert helpers for the on-chain indexer foundation
 * (p2p_offers, p2p_trades, p2p_disputes, p2p_merchant_applications — see
 * the SQL migration). Called by app/api/admin/index-sync/route.ts today
 * (a manually-triggered stub); a real background worker would call these
 * exact same functions later without needing to change anything here.
 *
 * TYPING NOTE: none of these tables are in
 * lib/types/database-generated.ts yet (that file is regenerated from the
 * live project via `npx supabase gen types typescript`, not hand-edited —
 * see lib/types/database.ts's comments for why hand-authoring that shape
 * repeatedly broke build types for `profiles`). Same untyped escape hatch
 * already used in lib/supabase-chat.ts for `chat_messages` — once the SQL
 * above has been run and types regenerated, these casts can be removed in
 * favor of real generated types.
 *
 * All amounts/ids that could exceed JS's safe integer range are passed as
 * STRINGS (bigint.toString()) by callers — never raw JS numbers — matching
 * the `numeric` column type used throughout the SQL migration.
 */

function untypedAdmin(): SupabaseClient | null {
  const admin = getSupabaseAdmin();
  return admin ? (admin as unknown as SupabaseClient) : null;
}

export interface OfferRowInput {
  offer_id: string;
  merchant_address: string;
  side: number;
  token_address: string;
  token_symbol: string;
  fiat_currency: string;
  rate: string;
  min_amount: string;
  max_amount: string;
  terms: string;
  active: boolean;
  paused: boolean;
  views: string;
  trades_count: string;
  volume: string;
  created_at_chain: string;
}

export interface TradeRowInput {
  trade_id: string;
  offer_id: string;
  token_address: string;
  token_symbol: string;
  amount: string;
  maker_fee_amount: string;
  taker_fee_amount: string;
  crypto_buyer: string;
  crypto_seller: string;
  fiat_amount: string;
  fiat_currency: string;
  status: number;
  locked_at: string;
  timer_duration: string;
  fiat_marked_at: string;
  dispute_raised: boolean;
  evidence_uri: string;
}

export interface DisputeRowInput {
  trade_id: string;
  offer_id: string | null;
  raised_by: string;
  evidence_uri: string;
  status: number;
}

export interface MerchantApplicationRowInput {
  wallet_address: string;
  is_pending: boolean;
  is_approved: boolean;
}

/** Returns `true` on success, `false` on any failure — never throws, so a
 * sync loop can log-and-continue to the next row rather than aborting the
 * whole batch over one bad upsert. */
async function upsert(table: string, row: Record<string, unknown>, conflictKey: string): Promise<boolean> {
  const admin = untypedAdmin();
  if (!admin) return false;

  const { error } = await admin.from(table).upsert(
    { ...row, synced_at: new Date().toISOString() },
    { onConflict: conflictKey }
  );

  if (error) {
    console.warn(`[supabase-indexer] upsert ${table} failed:`, error.message);
    return false;
  }
  return true;
}

export function upsertOffer(offer: OfferRowInput): Promise<boolean> {
  return upsert("p2p_offers", { ...offer, merchant_address: offer.merchant_address.toLowerCase() }, "offer_id");
}

export function upsertTrade(trade: TradeRowInput): Promise<boolean> {
  return upsert(
    "p2p_trades",
    {
      ...trade,
      crypto_buyer: trade.crypto_buyer.toLowerCase(),
      crypto_seller: trade.crypto_seller.toLowerCase(),
    },
    "trade_id"
  );
}

export function upsertDispute(dispute: DisputeRowInput): Promise<boolean> {
  return upsert("p2p_disputes", { ...dispute, raised_by: dispute.raised_by.toLowerCase() }, "trade_id");
}

export function upsertMerchantApplication(app: MerchantApplicationRowInput): Promise<boolean> {
  return upsert(
    "p2p_merchant_applications",
    { ...app, wallet_address: app.wallet_address.toLowerCase() },
    "wallet_address"
  );
}
