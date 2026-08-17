import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";

/**
 * SERVER-ONLY Supabase client using the service_role key, which bypasses
 * Row Level Security entirely. This is for trusted server-side writes
 * (e.g. a future API route that verifies a wallet owns the profile it's
 * writing to, then upserts using this client) — never import this into a
 * client component or anything that ends up in the browser bundle.
 *
 * The `import "server-only"` line above makes that a build-time error
 * instead of a silent leak: any client-component import chain that pulls
 * this file in will fail `npm run build`.
 *
 * Foundation only — nothing calls this yet. No write/upsert logic exists
 * until a future API route is built on top of it.
 *
 * Typed with `<Database>`, sourced from lib/types/database-generated.ts
 * (produced by `npx supabase gen types typescript` against the live
 * project) — this guarantees the type matches whatever
 * @supabase/postgrest-js version is actually installed, rather than a
 * hand-guessed shape. If the schema changes, regenerate that file rather
 * than hand-editing types here.
 *
 * Storage: two private-by-default buckets (`avatars`, `evidence`) exist in
 * Supabase Storage — see STORAGE_BUCKETS in `lib/constants.ts` for their
 * names, and the SQL migration for their policies. Evidence uploads use
 * this client via lib/supabase-evidence-upload.ts (not wired into any
 * dispute/chat UI yet — foundation only). Avatar upload has no route yet.
 *
 * Env var: SUPABASE_SERVICE_ROLE_KEY (see app/.env.example). Safe to leave
 * unset — see getSupabaseAdmin() below.
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let adminClient: SupabaseClient<Database> | null = null;

if (supabaseUrl && serviceRoleKey) {
  adminClient = createClient<Database>(supabaseUrl, serviceRoleKey, {
    auth: {
      // No session/user to persist — this client acts as the service
      // itself, not on behalf of a signed-in Supabase Auth user.
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

/**
 * Returns the service-role Supabase client, or `null` if
 * NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY aren't set.
 *
 * Deliberately returns `null` rather than throwing so that importing this
 * module can never crash the app at boot — same non-breaking pattern as
 * lib/supabase.ts. Future call sites (API routes) should null-check and
 * respond with a clear "Supabase not configured" error rather than assume
 * this is always available.
 */
export function getSupabaseAdmin(): SupabaseClient<Database> | null {
  return adminClient;
}
