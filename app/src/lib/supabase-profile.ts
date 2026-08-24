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

/**
 * READ-ONLY, batched. Looks up avatar_url for many wallet addresses in a
 * single query — used by P2P offer lists, where resolving each merchant's
 * avatar individually (one request per card) would mean N round trips
 * instead of one. Same anon client, same public-SELECT RLS policy, same
 * safe-by-construction contract as getProfileByWallet above (never throws,
 * returns an empty map on any failure so callers just fall back to
 * initials for every address rather than erroring).
 *
 * Returns a map keyed by lowercased wallet address -> avatar_url (only
 * present for wallets that actually have one set; addresses with no
 * profile row, or a profile with no avatar, are simply absent from the
 * returned map — callers should treat a missing key the same as `null`).
 */
export async function getAvatarsByWallets(
  walletAddresses: string[]
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(walletAddresses.filter(Boolean).map((a) => a.toLowerCase())));
  if (!supabase || unique.length === 0) {
    return {};
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("wallet_address, avatar_url")
    .in("wallet_address", unique);

  if (error) {
    console.warn("[supabase-profile] getAvatarsByWallets failed:", error.message);
    return {};
  }

  const result: Record<string, string> = {};
  for (const row of data ?? []) {
    if (row.avatar_url) result[row.wallet_address] = row.avatar_url;
  }
  return result;
}
