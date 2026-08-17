import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Minimal Supabase foundation. Nothing in the app depends on this yet —
 * it exists purely so future features (trade chat, profile/bank-details
 * sync, etc.) can plug into a single client without any store/component
 * having to worry about credentials being absent.
 *
 * IMPORTANT: this must never throw at import time. `lib/supabase.ts` gets
 * pulled into the client bundle, and — same spirit as the Circle wiring in
 * lib/circle.ts — missing keys should degrade gracefully (features that
 * use Supabase later fall back to their existing local/Zustand behavior)
 * rather than crash the whole app on boot.
 *
 * Schema: see `lib/types/database.ts` for the `profiles` table row types
 * (matches the SQL migration run in Supabase's SQL Editor). Not wired up
 * to this client yet — that's a future step, not this one.
 *
 * This client uses the public anon key and is safe in client components.
 * For trusted server-side writes (bypassing RLS), see the separate
 * SERVER-ONLY `lib/supabase-admin.ts` — never import that one here or
 * anywhere client-facing.
 *
 * Env vars (see app/.env.example):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True only when both env vars are present and non-empty. */
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

/**
 * The shared Supabase client, or `null` if env vars aren't set. Always
 * check `isSupabaseConfigured` (or just null-check this) before using it —
 * every future call site should treat `null` as "Supabase unavailable,
 * fall back to local behavior," never as an error to throw.
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        // No Supabase Auth session management yet — vLitePay's auth is
        // wallet/Circle-based (see useVLiteStore, AuthGate). This client is
        // for data access only until/unless that changes.
        persistSession: false,
      },
    })
  : null;

/**
 * Convenience accessor for call sites that prefer a function/guard style
 * over importing the `supabase` const directly, e.g.:
 *
 *   const db = getSupabase();
 *   if (!db) return; // Supabase not configured — no-op / local fallback
 */
export function getSupabase(): SupabaseClient | null {
  return supabase;
}
