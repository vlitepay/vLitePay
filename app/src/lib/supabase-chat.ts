import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * SERVER-ONLY chat message persistence. Both functions here require the
 * caller to have already verified whatever access control applies (see
 * app/api/chat/messages/route.ts for the actual security order) — neither
 * function here checks wallet ownership or trade participation itself,
 * same trust-boundary pattern as lib/supabase-profile-write.ts's
 * upsertProfile().
 *
 * TYPING NOTE: chat_messages is not yet a table in
 * lib/types/database-generated.ts (that file is regenerated from the live
 * project via `npx supabase gen types typescript`, not hand-edited — see
 * lib/types/database.ts's comments for why hand-authoring that shape
 * repeatedly broke build types for the profiles table). Rather than repeat
 * that mistake here, getSupabaseAdmin()'s result is cast to an untyped
 * SupabaseClient just for these calls. Once the SQL migration has been run
 * and database-generated.ts regenerated to include chat_messages, this
 * cast can be removed and ChatMessageRow/Insert below replaced with
 * `Database["public"]["Tables"]["chat_messages"]["Row"/"Insert"]`, mirroring
 * exactly how ProfileRow/ProfileInsert work today.
 */

export interface ChatMessageRow {
  id: string;
  trade_id: number;
  sender_address: string;
  sender_role: "buyer" | "seller" | "system";
  body: string | null;
  proof_url: string | null;
  bank_details: unknown | null;
  created_at: string;
}

export interface ChatMessageInsert {
  trade_id: number;
  sender_address: string;
  sender_role: "buyer" | "seller" | "system";
  body?: string | null;
  proof_url?: string | null;
  bank_details?: unknown | null;
}

function untypedAdmin(): SupabaseClient | null {
  const admin = getSupabaseAdmin();
  return admin ? (admin as unknown as SupabaseClient) : null;
}

/**
 * Loads all messages for a trade, oldest first. Returns `[]` (not `null`)
 * on any failure or if Supabase is unconfigured — a conversation with zero
 * messages and "couldn't load" are both safely treated as "show nothing
 * yet" by a future UI, rather than needing separate error handling.
 */
export async function getMessagesForTrade(tradeId: number | bigint): Promise<ChatMessageRow[]> {
  const admin = untypedAdmin();
  if (!admin) return [];

  const { data, error } = await admin
    .from("chat_messages")
    .select("*")
    .eq("trade_id", Number(tradeId))
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("[supabase-chat] getMessagesForTrade failed:", error.message);
    return [];
  }

  return (data as ChatMessageRow[]) ?? [];
}

/**
 * Inserts one chat message. Returns the inserted row, or `null` on any
 * failure (Supabase unconfigured, insert error) — never throws.
 */
export async function insertChatMessage(message: ChatMessageInsert): Promise<ChatMessageRow | null> {
  const admin = untypedAdmin();
  if (!admin) return null;

  const { data, error } = await admin
    .from("chat_messages")
    .insert({ ...message, sender_address: message.sender_address.toLowerCase() })
    .select()
    .maybeSingle();

  if (error) {
    console.warn("[supabase-chat] insertChatMessage failed:", error.message);
    return null;
  }

  return (data as ChatMessageRow | null) ?? null;
}
