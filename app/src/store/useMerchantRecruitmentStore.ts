import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface MerchantRecruitmentConfig {
  note: string;
  xUrl: string;
  telegramUrl: string;
  whatsappUrl: string;
  email: string;
}

const DEFAULTS: MerchantRecruitmentConfig = {
  note: "To become a merchant, please reach out to the team first for verification.",
  xUrl: "https://x.com/vlitepay",
  telegramUrl: "https://t.me/vlitepay",
  whatsappUrl: "https://wa.me/10000000000",
  email: "support@vlitepay.com",
};

/**
 * Lightweight, owner-editable config for the merchant recruitment note shown
 * on the Profile / MyShop "Apply for Merchant" section. Intentionally simple
 * (local persisted store, no backend or on-chain storage) — the owner edits
 * it from Admin > Settings and it's read wherever the apply flow is shown.
 */
interface MerchantRecruitmentState {
  config: MerchantRecruitmentConfig;
  setConfig: (config: MerchantRecruitmentConfig) => void;
}

export const useMerchantRecruitmentStore = create<MerchantRecruitmentState>()(
  persist(
    (set) => ({
      config: DEFAULTS,
      setConfig: (config) => set({ config }),
    }),
    { name: "vlitepay-merchant-recruitment" }
  )
);
