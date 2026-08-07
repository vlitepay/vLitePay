import { create } from "zustand";
import { persist } from "zustand/middleware";

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
    }),
    { name: "vlitepay-profile-store" }
  )
);
