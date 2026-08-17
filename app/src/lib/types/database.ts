/**
 * Mirrors the `public.profiles` table in Supabase. This is schema-only for
 * now — nothing in the app reads or writes through these types yet.
 * useProfileStore remains the live source of truth (localStorage) until a
 * sync layer is built on top of this table.
 *
 * wallet_address is the real identifier (Circle/wallet-based auth, not
 * Supabase Auth), matching how useProfileStore keys profiles today.
 *
 * `Database` here is re-exported from `database-generated.ts`, produced by
 * `npx supabase gen types typescript --project-id <ref>` against the live
 * project. Earlier versions of this file hand-authored the Database shape
 * (including a guessed `__InternalSupabase.PostgrestVersion`), which
 * repeatedly mismatched @supabase/postgrest-js's actual internal
 * type-inference contract (confirmed version in use: postgrest-js
 * 2.112.3 / PostgrestVersion "14.5") and broke `upsert()`/`insert()`
 * typing. Using the generated file directly avoids re-guessing that
 * contract — if the schema changes, regenerate database-generated.ts
 * rather than hand-editing either file.
 *
 * ProfileRow/ProfileInsert/ProfileUpdate below are just convenience
 * aliases into that generated shape, so every existing import of these
 * names (lib/supabase-profile.ts, lib/supabase-profile-write.ts,
 * lib/supabase-admin.ts) needed zero changes.
 */
import type { Database as GeneratedDatabase, Json } from "./database-generated";

export type Database = GeneratedDatabase;

type ProfilesTable = Database["public"]["Tables"]["profiles"];

/** A full row as returned by a `select * from profiles`. */
export type ProfileRow = ProfilesTable["Row"];

/** Fields needed to insert a new profile — matches the generated Insert
 * type exactly (id/created_at/updated_at optional/DB-defaulted,
 * wallet_address required). */
export type ProfileInsert = ProfilesTable["Insert"];

/** Fields allowed on an update via lib/supabase-profile-write.ts's
 * upsertProfile(). wallet_address/id/created_at/updated_at intentionally
 * excluded — wallet_address is the stable identifier (passed as its own
 * argument, not part of `data`), and the rest are DB-managed. */
export type ProfileUpdate = Partial<
  Omit<ProfileInsert, "wallet_address" | "id" | "created_at" | "updated_at">
>;

/** `socials`/`bank_details` are jsonb columns — Json from the generated
 * file is the accurate type. These aliases exist for readability at
 * future call sites; ProfileRow/ProfileInsert/ProfileUpdate already use
 * Json directly for these fields via the generated shape. */
export type ProfileSocials = Json;
export type ProfileBankDetails = Json;

