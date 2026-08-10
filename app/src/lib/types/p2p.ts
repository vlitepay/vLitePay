import type { TokenSymbol } from "@/lib/constants";

/** Mirrors P2PEscrow.OfferSide */
export enum OfferSide {
  MerchantBuys = 0, // merchant pays fiat, receives crypto
  MerchantSells = 1, // merchant provides crypto, receives fiat
}

/** Mirrors P2PEscrow.TradeStatus */
export enum TradeStatus {
  Locked = 0,
  FiatMarked = 1,
  Released = 2,
  Disputed = 3,
  Resolved = 4,
  Cancelled = 5,
}

export interface Offer {
  id: bigint;
  merchant: `0x${string}`;
  side: OfferSide;
  token: `0x${string}`;
  tokenSymbol: TokenSymbol;
  fiatCurrency: string;
  rate: bigint; // fiat units per 1 token, scaled 1e18
  minAmount: bigint; // token smallest units
  maxAmount: bigint;
  terms: string;
  active: boolean;
  paused: boolean;
  views: bigint;
  tradesCount: bigint;
  volume: bigint;
  createdAt: bigint;
}

export interface Trade {
  id: bigint;
  offerId: bigint;
  token: `0x${string}`;
  tokenSymbol: TokenSymbol;
  amount: bigint;
  /** Snapshotted at accept time — charged to the depositor (maker/seller) on top of `amount`. */
  makerFeeAmount: bigint;
  /** Snapshotted at accept time — deducted from the buyer's (taker's) payout. */
  takerFeeAmount: bigint;
  cryptoBuyer: `0x${string}`;
  cryptoSeller: `0x${string}`;
  fiatAmount: bigint;
  fiatCurrency: string;
  status: TradeStatus;
  lockedAt: bigint;
  timerDuration: bigint;
  fiatMarkedAt: bigint;
  disputeRaised: boolean;
  evidenceURI: string;
}

export interface TradeRating {
  stars: number;
  comment: string;
  rater: `0x${string}`;
  timestamp: bigint;
}

/** Local (off-chain) mini-chat message — persisted client-side for now, Socket.io-ready. */
export interface ChatMessage {
  id: string;
  tradeId: number;
  sender: "buyer" | "seller" | "system";
  senderAddress?: `0x${string}`;
  text?: string;
  proofDataUrl?: string; // payment proof image, stored as data URL until backend upload endpoint lands
  /**
   * Set when this message is a "Share bank details" post from the seller
   * (see components/p2p/TradeChat.tsx) rather than freeform text — a
   * snapshot of one of the sender's saved BankAccount entries (see
   * store/useProfileStore.ts) at the moment it was shared, so it stays
   * accurate in the chat history even if the sender edits/removes that
   * saved account later.
   */
  bankDetails?: {
    bankName: string;
    accountName: string;
    accountNumber: string;
    currency: string;
  };
  timestamp: number;
}

/**
 * Discovered via MerchantApplied event-log replay (see
 * hooks/useMerchantApplications.ts) since P2PEscrow doesn't keep an
 * enumerable applicant list on-chain. Lives here (rather than in the hook
 * file) so store/useAdminCacheStore.ts can import the type without an
 * import cycle.
 */
export interface MerchantApplication {
  address: `0x${string}`;
  isPending: boolean;
  isApproved: boolean;
}
