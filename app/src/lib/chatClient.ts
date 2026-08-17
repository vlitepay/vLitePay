import type { ChatMessage } from "@/lib/types/p2p";

/**
 * Client-side wrapper for the chat persistence layer
 * (app/api/chat/messages). Normal chat sends require NO wallet signature —
 * only on-chain trade-participant verification, done server-side in the
 * route (see that file's comments for the full trade-off reasoning: a
 * signature popup per message is unworkable UX, especially on mobile).
 *
 * Dispute evidence upload (lib/uploadEvidenceClient.ts) is a separate,
 * deliberately still-signed flow — not touched by this file.
 */

interface ChatMessageRow {
  id: string;
  trade_id: number;
  sender_address: string;
  sender_role: "buyer" | "seller" | "system";
  body: string | null;
  proof_url: string | null;
  bank_details: ChatMessage["bankDetails"] | null;
  created_at: string;
}

function rowToChatMessage(row: ChatMessageRow): ChatMessage {
  return {
    id: row.id,
    tradeId: row.trade_id,
    sender: row.sender_role,
    senderAddress: row.sender_address as `0x${string}`,
    text: row.body ?? undefined,
    proofDataUrl: row.proof_url ?? undefined,
    bankDetails: row.bank_details ?? undefined,
    timestamp: new Date(row.created_at).getTime(),
  };
}

/**
 * Loads persisted messages for a trade. Returns `null` (not `[]`) on any
 * failure — network error, non-200, not-a-participant, malformed response
 * — so callers can distinguish "couldn't load, keep showing local data" from
 * "loaded successfully, this trade genuinely has zero messages so far."
 */
export async function loadChatMessages(tradeId: number, wallet: string): Promise<ChatMessage[] | null> {
  if (!wallet) return null;
  try {
    const res = await fetch(
      `/api/chat/messages?tradeId=${encodeURIComponent(tradeId)}&wallet=${encodeURIComponent(wallet.toLowerCase())}`
    );
    if (!res.ok) return null;
    const json = await res.json().catch(() => null);
    if (!Array.isArray(json?.messages)) return null;
    return (json.messages as ChatMessageRow[]).map(rowToChatMessage);
  } catch {
    return null;
  }
}

export type SendChatMessageResult = { ok: true; message: ChatMessage } | { ok: false; error: string };

export interface SendChatMessageParams {
  tradeId: number;
  wallet: string;
  senderRole: "buyer" | "seller" | "system";
  text?: string;
  proofUrl?: string;
  bankDetails?: ChatMessage["bankDetails"];
}

/**
 * Sends one message via a single POST — no signature step. Server-side,
 * the route verifies `wallet` is an actual on-chain participant of
 * `tradeId` before persisting (see app/api/chat/messages/route.ts).
 * Never throws: a non-participant wallet, validation error, or network
 * failure all resolve to `{ ok: false, error }`.
 */
export async function sendChatMessage(params: SendChatMessageParams): Promise<SendChatMessageResult> {
  try {
    const postRes = await fetch("/api/chat/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        wallet: params.wallet.toLowerCase(),
        tradeId: params.tradeId,
        senderRole: params.senderRole,
        body: params.text,
        proofUrl: params.proofUrl,
        bankDetails: params.bankDetails,
      }),
    });

    if (!postRes.ok) {
      const errJson = await postRes.json().catch(() => null);
      return {
        ok: false,
        error: typeof errJson?.error === "string" ? errJson.error : `Send failed (${postRes.status}).`,
      };
    }

    const json = await postRes.json().catch(() => null);
    if (!json?.message) {
      return { ok: false, error: "Send succeeded but the response was malformed." };
    }

    return { ok: true, message: rowToChatMessage(json.message as ChatMessageRow) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Send failed.";
    return { ok: false, error: message };
  }
}
