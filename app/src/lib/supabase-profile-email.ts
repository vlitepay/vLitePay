import "server-only";
import { getProfileByWallet } from "@/lib/supabase-profile";
import { upsertProfile } from "@/lib/supabase-profile-write";
import type { ProfileRow } from "@/lib/types/database";

/**
 * SERVER-ONLY. Sets `profiles.email` for `walletAddress` — but ONLY if the
 * profile doesn't already have an email on file. Never overwrites an
 * existing value, never called with a fresh signature requirement (see the
 * route calling this, app/api/profile/email/route.ts, for the reasoning).
 *
 * This is deliberately idempotent and one-directional (null -> value, never
 * value -> different value) specifically so it's safe to call without the
 * signature step every other profile write requires: the worst case if this
 * were ever called with a wrong wallet/email pair is a wallet that has no
 * email yet getting one written incorrectly — annoying, not a compromise of
 * existing data (bank details, an already-set email, etc. are untouched
 * either way, since upsertProfile below only ever includes the `email` key).
 *
 * Returns the resulting profile row (existing or newly updated), or `null`
 * if Supabase is unavailable — never throws.
 */
export async function setProfileEmailIfMissing(
  walletAddress: string,
  email: string
): Promise<ProfileRow | null> {
  const existing = await getProfileByWallet(walletAddress);

  if (existing?.email) {
    return existing; // already set — no-op, wallet keeps its existing email
  }

  return upsertProfile(walletAddress, { email });
}
