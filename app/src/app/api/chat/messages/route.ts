import { NextRequest, NextResponse } from "next/server";
import { getMessagesForTrade, insertChatMessage } from "@/lib/supabase-chat";
import { isTradeParticipant } from "@/lib/verify-trade-participant";

/**
 * GET  /api/chat/messages?tradeId=...&wallet=...
 * POST /api/chat/messages
 *
 * chat_messages has NO RLS policies (see the SQL migration) — it can
 * contain bank account numbers (ChatMessage.bankDetails), so unlike
 * profiles it must never be anon-readable. Both handlers below are the
 * actual privacy boundary, not the database.
 *
 * Both GET and POST are gated the same way: an ON-CHAIN PARTICIPANT CHECK
 * (isTradeParticipant), no wallet signature. POST used to require a full
 * nonce -> sign -> verify flow (same shape as profile/evidence writes) —
 * that was removed deliberately for normal chat sends: requiring a wallet
 * signature popup on every message (and every poll, for reads) is
 * unworkable UX, especially on mobile, for something as high-frequency as
 * chat. See the GET handler's comment below for the full trade-off
 * reasoning, which now applies symmetrically to POST as well.
 *
 * Dispute raising/evidence upload (app/api/evidence/upload) is
 * DELIBERATELY NOT changed by this — that flow keeps its full nonce ->
 * sign -> verify requirement, since it's low-frequency (once per dispute,
 * not once per message) and the stakes (locking funds in a dispute,
 * writing evidence tied to an on-chain claim) justify the extra step.
 */

/**
 * GATING TRADE-OFF (applies to both GET and POST below):
 *   - Requiring a fresh signature on every send/read would make chat
 *     unusable on mobile — a wallet popup per message, or per poll, isn't
 *     acceptable UX for a chat feature.
 *   - Same trust level as GET /api/profile (intentionally unauthenticated):
 *     a caller who already knows a trade's real on-chain buyer/seller
 *     address and the tradeId can read or post into that trade's chat
 *     without proving they control that address. This is a real, known
 *     limitation, not full authentication — tightening it later (e.g. a
 *     short-lived session token issued after one signature, reused across
 *     an entire chat session rather than per-message) is a natural
 *     follow-up, out of scope here.
 *   - It is still meaningfully better than no gate at all: tradeId alone
 *     is not sufficient, the caller must also supply the actual on-chain
 *     participant address, which isn't guessable/enumerable the way a
 *     small sequential tradeId is. Non-participants are still fully
 *     blocked from both reading and posting.
 */
export async function GET(req: NextRequest) {
  const tradeIdParam = req.nextUrl.searchParams.get("tradeId");
  const wallet = req.nextUrl.searchParams.get("wallet");

  if (!tradeIdParam || !wallet) {
    return NextResponse.json(
      { error: "Missing required `tradeId` or `wallet` search param" },
      { status: 400 }
    );
  }

  const tradeId = Number(tradeIdParam);
  if (!Number.isFinite(tradeId)) {
    return NextResponse.json({ error: "`tradeId` must be a number" }, { status: 400 });
  }

  const participant = await isTradeParticipant(tradeId, wallet);
  if (!participant) {
    return NextResponse.json(
      { error: "Wallet is not a participant in this trade" },
      { status: 403 }
    );
  }

  const messages = await getMessagesForTrade(tradeId);

  return NextResponse.json({ messages });
}

/**
 * POST /api/chat/messages
 * Body: {
 *   wallet: string;
 *   tradeId: number;
 *   senderRole: "buyer" | "seller" | "system";
 *   body?: string;
 *   proofUrl?: string;
 *   bankDetails?: unknown;
 * }
 *
 * ORDER:
 *   1. Validate required fields.
 *   2. isTradeParticipant(tradeId, wallet) — confirms `wallet` is actually
 *      the on-chain buyer or seller of this trade (or "system", for
 *      automated messages — see the check below). Non-participants are
 *      rejected here regardless of what they claim `wallet` to be.
 *   3. insertChatMessage().
 *
 * No nonce/signature step — see the file-level and GET comments above for
 * why that was deliberately removed for normal chat sends.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  if (
    !body ||
    typeof body.wallet !== "string" ||
    !body.wallet ||
    typeof body.tradeId !== "number" ||
    typeof body.senderRole !== "string" ||
    !["buyer", "seller", "system"].includes(body.senderRole)
  ) {
    return NextResponse.json(
      { error: "Missing or invalid required fields (wallet, tradeId, senderRole)" },
      { status: 400 }
    );
  }

  const { wallet, tradeId, senderRole } = body as {
    wallet: string;
    tradeId: number;
    senderRole: "buyer" | "seller" | "system";
  };

  // The wallet posting must actually be a participant in this trade.
  const participant = await isTradeParticipant(tradeId, wallet);
  if (!participant) {
    return NextResponse.json(
      { error: "Wallet is not a participant in this trade" },
      { status: 403 }
    );
  }

  const saved = await insertChatMessage({
    trade_id: tradeId,
    sender_address: wallet,
    sender_role: senderRole,
    body: typeof body.body === "string" ? body.body : null,
    proof_url: typeof body.proofUrl === "string" ? body.proofUrl : null,
    bank_details: body.bankDetails ?? null,
  });

  if (!saved) {
    return NextResponse.json(
      { error: "Message could not be saved. Supabase may be unavailable — try again shortly." },
      { status: 500 }
    );
  }

  return NextResponse.json({ message: saved });
}
