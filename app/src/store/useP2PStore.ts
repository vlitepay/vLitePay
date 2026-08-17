import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TokenSymbol } from "@/lib/constants";
import type { ChatMessage } from "@/lib/types/p2p";
import { OfferSide } from "@/lib/types/p2p";

interface P2PState {
  // --- Pair / tab selection (drives the offer browsing screen) ---
  selectedToken: TokenSymbol;
  selectedFiat: string;
  tab: "buy" | "sell";
  setSelectedToken: (t: TokenSymbol) => void;
  setSelectedFiat: (f: string) => void;
  setTab: (tab: "buy" | "sell") => void;

  /** Buy tab shows MerchantSells offers (user is buying crypto); Sell tab shows MerchantBuys offers. */
  offerSideForTab: () => OfferSide;

  // --- Local mini-chat (Socket.io-ready: swap this for real-time events later) ---
  messagesByTrade: Record<number, ChatMessage[]>;
  addMessage: (tradeId: number, message: ChatMessage) => void;
  /** Replaces a trade's message list wholesale — used to seed messages
   * loaded from Supabase (lib/chatClient.ts) on mount/poll, distinct from
   * addMessage's append-only semantics. */
  setMessages: (tradeId: number, messages: ChatMessage[]) => void;
}

export const useP2PStore = create<P2PState>()(
  persist(
    (set, get) => ({
      selectedToken: "USDC",
      selectedFiat: "NGN",
      tab: "buy",
      setSelectedToken: (t) => set({ selectedToken: t }),
      setSelectedFiat: (f) => set({ selectedFiat: f }),
      setTab: (tab) => set({ tab }),

      offerSideForTab: () => (get().tab === "buy" ? OfferSide.MerchantSells : OfferSide.MerchantBuys),

      messagesByTrade: {},
      addMessage: (tradeId, message) =>
        set((s) => ({
          messagesByTrade: {
            ...s.messagesByTrade,
            [tradeId]: [...(s.messagesByTrade[tradeId] ?? []), message],
          },
        })),
      setMessages: (tradeId, messages) =>
        set((s) => ({
          messagesByTrade: { ...s.messagesByTrade, [tradeId]: messages },
        })),
    }),
    { name: "vlitepay-p2p-store" }
  )
);
