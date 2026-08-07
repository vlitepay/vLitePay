import { create } from "zustand";
import { persist } from "zustand/middleware";

interface MerchantNotifiedState {
  notifiedAddresses: string[];
  markNotified: (address: string) => void;
  wasNotified: (address: string) => boolean;
}

export const useMerchantApprovalNotifiedStore = create<MerchantNotifiedState>()(
  persist(
    (set, get) => ({
      notifiedAddresses: [],
      markNotified: (address) =>
        set((s) => ({ notifiedAddresses: [...new Set([...s.notifiedAddresses, address.toLowerCase()])] })),
      wasNotified: (address) => get().notifiedAddresses.includes(address.toLowerCase()),
    }),
    { name: "vlitepay-merchant-approval-notified" }
  )
);
