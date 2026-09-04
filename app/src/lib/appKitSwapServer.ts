import "server-only";
import { AppKit } from "@circle-fin/app-kit";
import { createCircleUserWalletAdapter } from "@circle-fin/adapter-circle-wallets/ucw/server";
import type { AppKitSwapToken } from "@/lib/constants";

/**
 * Server-side App Kit Swap for Circle Digital Wallets (email/Google
 * login) — NOT the developer-controlled `createCircleWalletsAdapter` +
 * entity-secret path (that's for wallets Circle apps fully custody
 * server-side, wrong model for our end users). `createCircleUserWalletAdapter`
 * drives the SAME user-controlled wallet our client already uses via
 * userToken, and needs a live Circle challenge solved through the same
 * SDK PIN/biometric flow Send/P2P already use — see onChallenge below and
 * lib/circleConnector.ts's runCircleSdkChallenge.
 *
 * Adapter does NOT take an encryptionKey — only apiKey + userToken + chain
 * + onChallenge. `from: { adapter, chain }` omits `address`; the adapter
 * resolves the wallet address from the userToken itself.
 */

let kitSingleton: AppKit | null = null;
function getServerKit(): AppKit {
  if (!kitSingleton) kitSingleton = new AppKit();
  return kitSingleton;
}

const SWAP_SLIPPAGE_BPS = 300;

export function isAppKitCircleAdapterConfigured(): boolean {
  return !!process.env.CIRCLE_API_KEY;
}

export async function buildCircleUserWalletAdapter(params: {
  userToken: string;
  onChallenge: (challenge: { challengeId: string }) => void;
}) {
  if (!isAppKitCircleAdapterConfigured()) {
    throw new Error("Circle API key not configured on this environment yet.");
  }
  return createCircleUserWalletAdapter({
    apiKey: process.env.CIRCLE_API_KEY as string,
    userToken: params.userToken,
    chain: "Arc_Testnet",
    onChallenge: params.onChallenge,
  });
}

type CircleUserWalletAdapter = Awaited<ReturnType<typeof buildCircleUserWalletAdapter>>;

export async function estimateAppKitSwapForCircleWallet(params: {
  adapter: CircleUserWalletAdapter;
  tokenIn: AppKitSwapToken;
  tokenOut: AppKitSwapToken;
  amountIn: string;
}) {
  const kit = getServerKit();
  return kit.estimateSwap({
    from: { adapter: params.adapter, chain: "Arc_Testnet" },
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amountIn: params.amountIn,
    config: {
      apiKey: process.env.CIRCLE_API_KEY,
      slippageBps: SWAP_SLIPPAGE_BPS,
      // Circle User-Controlled Wallets are smart-contract accounts (SCA) —
      // they cannot use a USDC permit signature, so allowance must go
      // through a plain ERC20 approve instead. Only set for this adapter;
      // the WalletConnect/EOA path (lib/appKitSwap.ts) is unaffected.
      allowanceStrategy: "approve",
    },
  });
}

export async function executeAppKitSwapForCircleWallet(params: {
  adapter: CircleUserWalletAdapter;
  tokenIn: AppKitSwapToken;
  tokenOut: AppKitSwapToken;
  amountIn: string;
  stopLimit?: string;
}) {
  const kit = getServerKit();
  return kit.swap({
    from: { adapter: params.adapter, chain: "Arc_Testnet" },
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amountIn: params.amountIn,
    config: {
      apiKey: process.env.CIRCLE_API_KEY,
      slippageBps: SWAP_SLIPPAGE_BPS,
      allowanceStrategy: "approve",
      ...(params.stopLimit ? { stopLimit: params.stopLimit } : {}),
    },
  });
}
