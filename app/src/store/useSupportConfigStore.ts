import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface SupportContactConfig {
  email: string;
  xUrl: string;
  telegramUrl: string;
  whatsappUrl: string;
}

const DEFAULTS: SupportContactConfig = {
  email: "support@vlitepay.com",
  xUrl: "https://x.com/vlitepay",
  telegramUrl: "https://t.me/vlitepay",
  whatsappUrl: "https://wa.me/10000000000",
};

/**
 * Lightweight, owner-editable team contact info shown on the Support page.
 * Local persisted store (no backend), same pattern as the merchant
 * recruitment note — the owner edits it from Admin > Settings.
 */
interface SupportConfigState {
  config: SupportContactConfig;
  setConfig: (config: SupportContactConfig) => void;
}

export const useSupportConfigStore = create<SupportConfigState>()(
  persist(
    (set) => ({
      config: DEFAULTS,
      setConfig: (config) => set({ config }),
    }),
    { name: "vlitepay-support-config" }
  )
);
