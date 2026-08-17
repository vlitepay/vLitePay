import { supabase } from "@/lib/supabase";
import type { ProfileRow } from "@/lib/types/database";

/**
 * READ-ONLY foundation helper. Looks up a single profile row by wallet
 * address. No write/upsert logic exists yet — that will live in a future
 * service-role API route (using lib/supabase-admin.ts) once wallet
 * ownership verification is built.
 *
 * Uses the anon client (lib/supabase.ts), not the admin client — this is a
 * plain read, and the `profiles` table's RLS policy already allows public
 * SELECT, so no elevated privileges are needed here.
 *
 * Safe by construction:
 * - Returns `null` if Supabase isn't configured (missing env vars).
 * - Returns `null` if no row matches (table empty, or wallet unknown).
 * - Returns `null` (and logs a warning) on any query error, rather than
 *   throwing — callers can treat "no profile yet" and "Supabase currently
 *   unavailable" the same way: fall back to local/Zustand state.
 *
 * wallet_address is compared lowercased to match useProfileStore's
 * existing per-address keying convention. Future write logic must be
 * consistent about storing addresses lowercased for this to keep working.
 */
export async function getProfileByWallet(
  walletAddress: string
): Promise<ProfileRow | null> {
  if (!supabase || !walletAddress) {
    return null;
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("wallet_address", walletAddress.toLowerCase())
    .maybeSingle();

  if (error) {
    console.warn("[supabase-profile] getProfileByWallet failed:", error.message);
    return null;
  }

  return data ?? null;
}
