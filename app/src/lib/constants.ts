import { defineChain } from "viem";

/**
 * Supabase Storage bucket names. Buckets themselves (with size limits, MIME
 * restrictions, and RLS policies) are created via the SQL migration run in
 * Supabase's SQL Editor — these constants just avoid hardcoding bucket-id
 * strings once an upload path is eventually built (lib/supabase-admin.ts,
 * for a future service-role upload route).
 *
 * `avatars` — public read, profile pictures.
 * `evidence` — private, future payment-proof / dispute files.
 *
 * Not used anywhere yet; no upload/download logic exists at this stage.
 */
export const STORAGE_BUCKETS = {
  avatars: "avatars",
  evidence: "evidence",
} as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

/**
 * Server-side validation limits for uploads to the `evidence` bucket —
 * intentionally identical to that bucket's SQL-level `file_size_limit`/
 * `allowed_mime_types` (see the storage migration). Supabase itself already
 * enforces these at the bucket level, but checking here too lets the API
 * route (app/api/evidence/upload/route.ts) return a clear error before
 * attempting the upload, rather than surfacing a raw Storage error.
 */
export const EVIDENCE_UPLOAD_LIMITS = {
  maxSizeBytes: 10 * 1024 * 1024, // 10 MB — matches the SQL migration
  allowedMimeTypes: ["image/png", "image/jpeg", "image/webp", "application/pdf"] as const,
};

/**
 * Arc Testnet chain definition for viem/wagmi.
 *
 * `contracts.multicall3` is set explicitly to Arc's confirmed-deployed
 * Multicall3 instance (see https://docs.arc.io/arc/references/contract-addresses,
 * "Common Ethereum contracts" section). Without this, viem doesn't reliably
 * know a custom chain has Multicall3 available, so wagmi's `useReadContracts`
 * can end up firing one separate `eth_call` per contract instead of batching
 * them into a single aggregated call. Arc's public testnet RPC is documented
 * to rate-limit (HTTP 429) under exactly this kind of per-call polling load,
 * which is why USDC's balance (first in the request) would come back fine
 * while EURC/cirBTC (sent right after, in the same render) intermittently
 * failed — not a decimals/address bug, but an RPC request-volume problem.
 * Explicitly wiring Multicall3 collapses all token balance reads into one
 * request, which avoids that failure mode entirely.
 *
 * The RPC URL below points at our own /api/rpc proxy rather than
 * https://rpc.testnet.arc.network directly — that public endpoint doesn't
 * reliably send CORS headers for browser requests, which surfaced as
 * intermittent "unknown RPC error" failures specifically on longer-running
 * flows (Circle's PIN-confirm-then-broadcast round trip takes much longer
 * than a WalletConnect wallet handing back a hash, giving the flaky RPC
 * more chances to fail before `waitForTransactionReceipt` succeeds). The
 * proxy makes the actual request server-side, where CORS doesn't apply, and
 * forwards the response verbatim — see app/api/rpc/route.ts.
 */
export const arcTestnet = defineChain({
  id: 5042002,
  name: "Arc Testnet",
  nativeCurrency: { name: "USD Coin", symbol: "USDC", decimals: 6 },
  rpcUrls: {
    default: { http: ["/api/rpc"] },
  },
  blockExplorers: {
    default: { name: "ArcScan", url: "https://testnet.arcscan.app" },
  },
  contracts: {
    multicall3: {
      address: "0xcA11bde05977b3631167028862bE2a173976CA11",
    },
  },
  testnet: true,
});

export type TokenSymbol = "USDC" | "EURC" | "cirBTC";

export interface TokenConfig {
  symbol: TokenSymbol;
  name: string;
  address: `0x${string}`;
  decimals: number;
  color: string; // used for chart legends / badges
  icon: string; // simple emoji/glyph fallback; swap for SVG icons as design matures
  /** Official Circle token logo, served from /public/tokens — see components/TokenIcon.tsx. */
  iconSrc: string;
}

/** Arc Testnet token registry — addresses per project brief. Owner can extend via admin panel later. */
export const TOKENS: Record<TokenSymbol, TokenConfig> = {
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    address: "0x3600000000000000000000000000000000000000",
    decimals: 6,
    color: "#22D3EE",
    icon: "$",
    iconSrc: "/tokens/usdc.svg",
  },
  EURC: {
    symbol: "EURC",
    name: "Euro Coin",
    address: "0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a",
    decimals: 6,
    color: "#7C3AED",
    icon: "€",
    iconSrc: "/tokens/eurc.svg",
  },
  cirBTC: {
    symbol: "cirBTC",
    name: "Circle Bitcoin",
    address: "0xf0C4a4CE82A5746AbAAd9425360Ab04fbBA432BF",
    decimals: 8,
    color: "#FBBF24",
    icon: "₿",
    iconSrc: "/tokens/cirbtc.svg",
  },
};

/** Circle CCTP TokenMessenger on Arc Testnet — confirmed address, domain 26. */
export const ARC_CCTP_TOKEN_MESSENGER = "0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA" as `0x${string}`;
/** Arc Testnet's own Circle CCTP domain id (used by other chains when bridging INTO Arc). */
export const ARC_CCTP_DOMAIN = 26;

export const CONTRACTS = {
  usernameRegistry: (process.env.NEXT_PUBLIC_USERNAME_REGISTRY_ADDRESS || "") as `0x${string}`,
  p2pEscrow: (process.env.NEXT_PUBLIC_P2P_ESCROW_ADDRESS || "") as `0x${string}`,
  /** Circle CCTP TokenMessenger on Arc Testnet, used for outbound cross-chain sends. */
  tokenMessenger: (process.env.NEXT_PUBLIC_CCTP_TOKEN_MESSENGER_ADDRESS || ARC_CCTP_TOKEN_MESSENGER) as `0x${string}`,
  /**
   * SendWithFee helper (contracts/src/SendWithFee.sol) — collapses Send's
   * fee-on flow into a single atomic transaction/confirmation. Empty by
   * default/until deployed: hooks/useSend.ts's useLocalSend falls back to
   * the previous two-separate-transfers behavior whenever this is unset,
   * so leaving it blank is safe, not a broken state. Set
   * NEXT_PUBLIC_SEND_WITH_FEE_ADDRESS after running
   * `forge script script/DeploySendWithFee.s.sol:DeploySendWithFee
   * --rpc-url arc_testnet --broadcast --verify -vvvv` to enable the
   * single-confirmation path.
   */
  sendWithFee: (process.env.NEXT_PUBLIC_SEND_WITH_FEE_ADDRESS || "") as `0x${string}`,
};

export const CCTP_CHAINS = [
  { key: "arc", label: "Arc Testnet (local)", domain: null },
  { key: "base_sepolia", label: "Base Sepolia", domain: 6 },
  { key: "arbitrum_sepolia", label: "Arbitrum Sepolia", domain: 3 },
  { key: "ethereum_sepolia", label: "Ethereum Sepolia", domain: 0 },
  { key: "avalanche_fuji", label: "Avalanche Fuji", domain: 1 },
] as const;

/**
 * Fiat currencies enabled at deploy time (see contracts/script/Deploy.s.sol).
 * The contract's `supportedFiatCurrencies` mapping is the source of truth on-chain —
 * this list mirrors it for the UI and can be extended by the owner via the admin
 * panel (Phase 4), which should also update this list or replace it with an
 * on-chain-driven fetch once an indexer is in place.
 */
export const FIAT_CURRENCIES = [
  { code: "NGN", label: "Nigerian Naira", flag: "🇳🇬" },
  { code: "PHP", label: "Philippine Peso", flag: "🇵🇭" },
  { code: "EUR", label: "Euro", flag: "🇪🇺" },
  { code: "USD", label: "US Dollar", flag: "🇺🇸" },
  { code: "KES", label: "Kenyan Shilling", flag: "🇰🇪" },
  { code: "GHS", label: "Ghanaian Cedi", flag: "🇬🇭" },
  { code: "GBP", label: "British Pound", flag: "🇬🇧" },
  { code: "VND", label: "Vietnamese Dong", flag: "🇻🇳" },
  { code: "BRL", label: "Brazilian Real", flag: "🇧🇷" },
  { code: "INR", label: "Indian Rupee", flag: "🇮🇳" },
  { code: "MYR", label: "Malaysian Ringgit", flag: "🇲🇾" },
  { code: "IDR", label: "Indonesian Rupiah", flag: "🇮🇩" },
  { code: "ZAR", label: "South African Rand", flag: "🇿🇦" },
] as const;

export type FiatCode = (typeof FIAT_CURRENCIES)[number]["code"];

/**
 * Broader currency list for the P2P screen's "Global Reference Rate" card —
 * intentionally wider than `FIAT_CURRENCIES` above (which mirrors what's
 * actually tradeable on-chain today). This list is a market-rate *guide*,
 * not a claim that every currency here has a live P2P offer — matches what
 * Frankfurter v2 actually supports (verified against frankfurter.dev/currencies).
 */
export const REFERENCE_CURRENCIES = [
  { code: "USD", label: "US Dollar", flag: "🇺🇸" },
  { code: "EUR", label: "Euro", flag: "🇪🇺" },
  { code: "GBP", label: "British Pound", flag: "🇬🇧" },
  { code: "NGN", label: "Nigerian Naira", flag: "🇳🇬" },
  { code: "GHS", label: "Ghanaian Cedi", flag: "🇬🇭" },
  { code: "KES", label: "Kenyan Shilling", flag: "🇰🇪" },
  { code: "ZAR", label: "South African Rand", flag: "🇿🇦" },
  { code: "PHP", label: "Philippine Peso", flag: "🇵🇭" },
  { code: "IDR", label: "Indonesian Rupiah", flag: "🇮🇩" },
  { code: "MYR", label: "Malaysian Ringgit", flag: "🇲🇾" },
  { code: "VND", label: "Vietnamese Đồng", flag: "🇻🇳" },
  { code: "INR", label: "Indian Rupee", flag: "🇮🇳" },
  { code: "BRL", label: "Brazilian Real", flag: "🇧🇷" },
  { code: "MXN", label: "Mexican Peso", flag: "🇲🇽" },
] as const;

export type ReferenceCurrencyCode = (typeof REFERENCE_CURRENCIES)[number]["code"];

/** Loosely grouped by region, for an optional region filter in the reference-rate card. */
export const REFERENCE_CURRENCY_REGIONS: Record<string, ReferenceCurrencyCode[]> = {
  "Major": ["USD", "EUR", "GBP"],
  "Africa": ["NGN", "GHS", "KES", "ZAR"],
  "Asia": ["PHP", "IDR", "MYR", "VND", "INR"],
  "Latin America": ["BRL", "MXN"],
};

/** Countries offered in the Top Up region selector (ISO 3166-1 alpha-2 codes, as Reloadly expects). */
export const AIRTIME_COUNTRIES = [
  { code: "NG", label: "Nigeria", flag: "🇳🇬" },
  { code: "PH", label: "Philippines", flag: "🇵🇭" },
  { code: "KE", label: "Kenya", flag: "🇰🇪" },
  { code: "GH", label: "Ghana", flag: "🇬🇭" },
  { code: "US", label: "United States", flag: "🇺🇸" },
] as const;

/** How many offer ids to probe when browsing — testnet-scale multicall, replaced by a subgraph later. */
export const OFFER_SCAN_LIMIT = 60;

/** Same idea for trades — see useTradeHistory.ts. */
export const TRADE_SCAN_LIMIT = 100;

export const NAV_ITEMS = [
  { key: "home", label: "Home", href: "/" },
  { key: "transfer", label: "Transfer", href: "/transfer" },
  { key: "p2p", label: "P2P", href: "/p2p" },
  { key: "airtime", label: "Top Up", href: "/topup" },
  { key: "profile", label: "Profile", href: "/profile" },
] as const;
