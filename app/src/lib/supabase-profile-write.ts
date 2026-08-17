import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { ProfileRow, ProfileUpdate } from "@/lib/types/database";

/**
 * SERVER-ONLY write helper. NOT called by any route yet — this exists so
 * the write path's actual Supabase call is written and reviewable ahead of
 * time, separate from the wallet-verification work that must land first.
 *
 * ⚠️ NOT SAFE TO CALL FROM A ROUTE YET. This function trusts its inputs
 * completely — it does not verify that `walletAddress` is who it claims to
 * be. Before anything (e.g. app/api/profile/route.ts's POST handler) calls
 * this, that caller MUST have already verified a signed message
 * (personal_sign) proving ownership of `walletAddress`, using viem's
 * verifyMessage. Wiring this up without that check first would let anyone
 * overwrite any wallet's profile.
 *
 * Uses getSupabaseAdmin() (service-role client) because the `profiles` RLS
 * policy only allows anon SELECT — writes require bypassing RLS via the
 * service role, same as every other write path in this foundation.
 *
 * wallet_address is lowercased to stay consistent with
 * lib/supabase-profile.ts's getProfileByWallet lookup convention.
 *
 * Returns the upserted row, or `null` if the admin client isn't configured
 * (missing SUPABASE_SERVICE_ROLE_KEY) or the upsert fails for any reason —
 * never throws, so a future caller can treat "unavailable" and "failed"
 * the same way without a try/catch.
 */
export async function upsertProfile(
  walletAddress: string,
  data: ProfileUpdate
): Promise<ProfileRow | null> {
  const admin = getSupabaseAdmin();

  if (!admin || !walletAddress) {
    return null;
  }

  const { data: row, error } = await admin
    .from("profiles")
    .upsert(
      {
        wallet_address: walletAddress.toLowerCase(),
        ...data,
      },
      { onConflict: "wallet_address" }
    )
    .select()
    .maybeSingle();

  if (error) {
    console.warn("[supabase-profile-write] upsertProfile failed:", error.message);
    return null;
  }

  return row ?? null;
}
