import { create } from "zustand";
import { persist } from "zustand/middleware";
import { signMessage } from "wagmi/actions";
import { wagmiConfig } from "@/lib/wagmi-config";
import type { ProfileRow } from "@/lib/types/database";

export interface SocialLink {
  id: string;
  platform: string;
  url: string;
}

export interface BankAccount {
  id: string;
  currency: string; // e.g. "NGN" — matches FIAT_CURRENCIES codes
  bankName: string;
  accountName: string;
  accountNumber: string;
}

export interface ProfileData {
  avatarDataUrl: string | null;
  bio: string;
  socials: SocialLink[];
  bankAccounts: BankAccount[];
}

const EMPTY_PROFILE: ProfileData = { avatarDataUrl: null, bio: "", socials: [], bankAccounts: [] };

/**
 * Supabase's `socials`/`bank_details` columns are untyped jsonb — nothing
 * has ever written real data into them yet (no write path is wired into
 * any component), so their actual runtime shape is unverified. These
 * guards make loadFromSupabase() below defensive: anything that isn't
 * recognizably a SocialLink/BankAccount is silently dropped rather than
 * corrupting the local store or throwing.
 */
function isSocialLink(x: unknown): x is SocialLink {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as Record<string, unknown>).id === "string" &&
    typeof (x as Record<string, unknown>).platform === "string" &&
    typeof (x as Record<string, unknown>).url === "string"
  );
}

function parseSocials(value: unknown): SocialLink[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isSocialLink);
}

function isBankAccount(x: unknown): x is BankAccount {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as Record<string, unknown>).id === "string" &&
    typeof (x as Record<string, unknown>).currency === "string" &&
    typeof (x as Record<string, unknown>).bankName === "string" &&
    typeof (x as Record<string, unknown>).accountName === "string" &&
    typeof (x as Record<string, unknown>).accountNumber === "string"
  );
}

function parseBankAccounts(value: unknown): BankAccount[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isBankAccount);
}

/** Fields saveToSupabase() can push — mirrors the API route's allow-list
 * (avatar_url, bio, socials, bank_details, email) in lib/types/database.ts's
 * ProfileUpdate, but named to match this store's local field names where
 * they differ (avatarDataUrl -> avatar_url) so callers pass what they
 * already have on hand rather than translating shapes themselves. */
export interface SaveableProfileFields {
  avatarDataUrl?: string | null;
  bio?: string;
  socials?: SocialLink[];
  bankAccounts?: BankAccount[];
  email?: string | null;
}

export type SaveToSupabaseResult =
  | { ok: true }
  | { ok: false; error: string };

interface ProfileState {
  /**
   * Profiles keyed by lowercased wallet address. This is a local-first store
   * (no ProfileRegistry contract exists yet) so data lives in this browser
   * only — swap for a backend-persisted profile API before production so
   * profiles follow the user across devices.
   */
  profiles: Record<string, ProfileData>;
  getProfile: (address: string | undefined) => ProfileData;
  setAvatar: (address: string, dataUrl: string | null) => void;
  setBio: (address: string, bio: string) => void;
  addSocial: (address: string, social: SocialLink) => void;
  removeSocial: (address: string, id: string) => void;
  addBankAccount: (address: string, account: BankAccount) => void;
  removeBankAccount: (address: string, id: string) => void;
  /**
   * Optionally loads a profile from Supabase (GET /api/profile) and merges
   * it into the local store — READ ONLY, no write/sync direction exists
   * yet. Nothing calls this automatically; no component is wired to it in
   * this step.
   *
   * Local-first merge: for each field, local data wins if it already
   * exists — Supabase only fills in fields that are currently empty. This
   * means an existing local profile is never overwritten by a stale or
   * different Supabase copy, while a fresh browser/device with no local
   * data yet can still pick up whatever's already saved remotely.
   *
   * Never throws: network failure, Supabase being unconfigured, a missing
   * profile row, or malformed jsonb fields (socials/bank_details) all
   * resolve to "keep local data exactly as it is" — the UI never sees an
   * error from this.
   */
  loadFromSupabase: (address: string | undefined) => Promise<void>;

  /**
   * Explicitly, optionally pushes profile data to Supabase using the
   * existing secure write path: GET /api/profile/nonce -> wallet signs the
   * returned message -> POST /api/profile with { wallet, message,
   * signature, ...fields }. NOT called automatically by setAvatar/setBio/
   * etc. — a caller (e.g. a future "Sync to cloud" button) must invoke
   * this explicitly.
   *
   * `fields` defaults to the current local profile for `address` if
   * omitted, so `saveToSupabase(address)` alone pushes everything already
   * saved locally. Pass a partial SaveableProfileFields to push only
   * specific fields instead.
   *
   * Signing goes through wagmi's `signMessage` action (not the `useSignMessage`
   * hook, since this runs outside a component) — this dispatches through
   * whichever connector is currently active in wagmiConfig, so it works
   * identically whether the user connected via injected/WalletConnect or
   * via the Circle email connector (lib/circleConnector.ts implements
   * personal_sign the same as any other EIP-1193 provider).
   *
   * On success: local state is left untouched (local storage stays the
   * source of truth per this step's scope) — the caller can inspect
   * `.ok` to show a success indicator if desired.
   * On failure (rejected signature, expired/invalid nonce, network error,
   * Supabase unavailable, etc.): never throws — returns
   * `{ ok: false, error }` with a clear, user-presentable message, and
   * local data is left completely unchanged.
   */
  saveToSupabase: (
    address: string | undefined,
    fields?: SaveableProfileFields
  ) => Promise<SaveToSupabaseResult>;
}

export const useProfileStore = create<ProfileState>()(
  persist(
    (set, get) => ({
      profiles: {},

      getProfile: (address) => {
        if (!address) return EMPTY_PROFILE;
        return get().profiles[address.toLowerCase()] ?? EMPTY_PROFILE;
      },

      setAvatar: (address, dataUrl) =>
        set((s) => {
          const key = address.toLowerCase();
          const existing = s.profiles[key] ?? EMPTY_PROFILE;
          return { profiles: { ...s.profiles, [key]: { ...existing, avatarDataUrl: dataUrl } } };
        }),

      setBio: (address, bio) =>
        set((s) => {
          const key = address.toLowerCase();
          const existing = s.profiles[key] ?? EMPTY_PROFILE;
          return { profiles: { ...s.profiles, [key]: { ...existing, bio } } };
        }),

      addSocial: (address, social) =>
        set((s) => {
          const key = address.toLowerCase();
          const existing = s.profiles[key] ?? EMPTY_PROFILE;
          return { profiles: { ...s.profiles, [key]: { ...existing, socials: [...existing.socials, social] } } };
        }),

      removeSocial: (address, id) =>
        set((s) => {
          const key = address.toLowerCase();
          const existing = s.profiles[key] ?? EMPTY_PROFILE;
          return {
            profiles: { ...s.profiles, [key]: { ...existing, socials: existing.socials.filter((x) => x.id !== id) } },
          };
        }),

      addBankAccount: (address, account) =>
        set((s) => {
          const key = address.toLowerCase();
          const existing = s.profiles[key] ?? EMPTY_PROFILE;
          return {
            profiles: { ...s.profiles, [key]: { ...existing, bankAccounts: [...existing.bankAccounts, account] } },
          };
        }),

      removeBankAccount: (address, id) =>
        set((s) => {
          const key = address.toLowerCase();
          const existing = s.profiles[key] ?? EMPTY_PROFILE;
          return {
            profiles: {
              ...s.profiles,
              [key]: { ...existing, bankAccounts: existing.bankAccounts.filter((x) => x.id !== id) },
            },
          };
        }),

      loadFromSupabase: async (address) => {
        if (!address) return;
        const key = address.toLowerCase();

        let remote: ProfileRow | null = null;
        try {
          const res = await fetch(`/api/profile?wallet=${encodeURIComponent(key)}`);
          if (!res.ok) return; // non-200 (Supabase down, 400, etc.) -> keep local as-is
          const json = await res.json().catch(() => null);
          remote = (json?.profile as ProfileRow | null) ?? null;
        } catch {
          return; // network error / fetch unavailable -> keep local as-is
        }

        if (!remote) return; // no remote profile yet -> keep local as-is

        set((s) => {
          const existing = s.profiles[key] ?? EMPTY_PROFILE;

          const merged: ProfileData = {
            avatarDataUrl:
              existing.avatarDataUrl ?? (typeof remote.avatar_url === "string" ? remote.avatar_url : null),
            bio: existing.bio || (typeof remote.bio === "string" ? remote.bio : ""),
            socials: existing.socials.length > 0 ? existing.socials : parseSocials(remote.socials),
            bankAccounts:
              existing.bankAccounts.length > 0 ? existing.bankAccounts : parseBankAccounts(remote.bank_details),
          };

          return { profiles: { ...s.profiles, [key]: merged } };
        });
      },

      saveToSupabase: async (address, fields) => {
        if (!address) {
          return { ok: false, error: "No wallet connected." };
        }
        const key = address.toLowerCase();
        const source = fields ?? get().profiles[key] ?? EMPTY_PROFILE;

        // Local -> API field-name translation (avatarDataUrl -> avatar_url,
        // bankAccounts -> bank_details) happens here, once, rather than
        // asking every future caller to know the API's column names.
        //
        // isDefaultSync=true means "push everything I have locally" (the
        // Sync profile button calls saveToSupabase(address) with no
        // explicit fields) — in that case, an EMPTY local value must never
        // be sent, since Supabase may already correctly hold a value this
        // browser simply doesn't have cached (e.g. an avatar uploaded and
        // synced from a different device/session). Sending it anyway would
        // silently clobber already-working remote data with emptiness —
        // this is exactly what caused merchant avatars to disappear for
        // every viewer after an affected merchant re-synced from a session
        // with no local avatar cached.
        //
        // A caller that passes `fields` explicitly is trusted to mean it —
        // including an intentional `null`/empty value to actually clear a
        // field — so that path is untouched.
        const isDefaultSync = !fields;
        const payloadFields: Record<string, unknown> = {};
        const include = (apiKey: string, value: unknown, isEmpty: boolean) => {
          if (!isDefaultSync || !isEmpty) payloadFields[apiKey] = value;
        };

        if ("avatarDataUrl" in source) include("avatar_url", source.avatarDataUrl, !source.avatarDataUrl);
        if ("bio" in source) include("bio", source.bio, !source.bio);
        if ("socials" in source) include("socials", source.socials, Array.isArray(source.socials) && source.socials.length === 0);
        if ("bankAccounts" in source)
          include("bank_details", source.bankAccounts, Array.isArray(source.bankAccounts) && source.bankAccounts.length === 0);
        if ("email" in source) include("email", source.email, !source.email);

        try {
          // 1. Get a fresh, single-use nonce/message for this wallet.
          const nonceRes = await fetch(`/api/profile/nonce?wallet=${encodeURIComponent(key)}`);
          if (!nonceRes.ok) {
            return { ok: false, error: "Could not start a secure save — please try again." };
          }
          const nonceJson = await nonceRes.json().catch(() => null);
          const message = nonceJson?.message;
          if (typeof message !== "string" || !message) {
            return { ok: false, error: "Could not start a secure save — please try again." };
          }

          // 2. Ask the connected wallet (injected/WalletConnect/Circle — all
          // handled identically via wagmi's connector-agnostic action) to
          // sign that exact message. The user's wallet UI (or Circle's
          // PIN/biometric prompt) shows the message here; rejecting it
          // throws, which the catch below turns into a clean error result.
          const signature = await signMessage(wagmiConfig, { account: address as `0x${string}`, message });

          // 3. Submit wallet + message + signature + fields. The API route
          // re-verifies all of this server-side (consumeProfileNonce then
          // verifyWalletSignature) before writing — this client-side flow
          // doesn't grant any trust on its own, it just supplies what the
          // server requires.
          const postRes = await fetch("/api/profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ wallet: key, message, signature, ...payloadFields }),
          });

          if (!postRes.ok) {
            const errJson = await postRes.json().catch(() => null);
            return {
              ok: false,
              error: typeof errJson?.error === "string" ? errJson.error : `Save failed (${postRes.status}).`,
            };
          }

          return { ok: true };
        } catch (err) {
          // Covers: signature rejected by the user, wallet/Circle prompt
          // errored, or a network failure at any step. Local data is
          // untouched in every case — nothing here calls set().
          const message = err instanceof Error ? err.message : "Save failed.";
          return { ok: false, error: message };
        }
      },
    }),
    { name: "vlitepay-profile-store" }
  )
);
