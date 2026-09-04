"use client";

import { AppKit } from "@circle-fin/app-kit";
import { createViemAdapterFromProvider } from "@circle-fin/adapter-viem-v2";
import type { AppKitSwapToken } from "@/lib/constants";

/**
 * Circle App Kit Swap — real on-chain USDC/EURC/cirBTC swaps on Arc
 * Testnet (docs: https://docs.arc.network/app-kit/swap). This is the only
 * Swap UI on the Transfer page — StableFX's swap UI has been fully
 * removed; lib/stablefx.ts and /api/stablefx/* remain in the codebase
 * unmounted, not wired to anything.
 *
 * ADAPTER SCOPE — verified against Circle's published adapter set, not
 * guessed: App Kit ships four adapter families — Viem (private key OR a
 * browser EIP-1193 provider via createViemAdapterFromProvider), Ethers,
 * Solana Kit, and Circle Wallets (createCircleWalletsAdapter — server-side
 * ONLY, requires an API key + entity secret, and only drives Circle's
 * DEVELOPER-controlled wallets). There is no published Circle adapter that
 * bridges App Kit Swap to Circle's USER-controlled wallet challenge/PIN
 * flow (the email/Google login this app otherwise uses) — a function like
 * "createCircleUserWalletAdapter" does not exist in Circle's adapter set
 * as of this writing. Inventing one would mean shipping a fabricated
 * integration for something that moves real funds, so this file only
 * wires up the ONE verified, real path: a connected external wallet
 * (WalletConnect or an auto-detected injected wallet) exposing a genuine
 * EIP-1193 provider. See hooks/useAppKitSwap.ts for how Circle Digital
 * Wallet sessions are handled instead — a clear "not available yet"
 * state, not a fabricated adapter.
 *
 * NO API KEY IS PASSED HERE — this code runs in the browser, and
 * CIRCLE_API_KEY / any App Kit key must never reach the client. Circle's
 * docs describe the key as optional for Swap ("without one, requests
 * share a rate limit"), which is an acceptable tradeoff on testnet rather
 * than shipping a secret to the browser.
 */

let kitSingleton: AppKit | null = null;
function getKit(): AppKit {
  if (!kitSingleton) kitSingleton = new AppKit();
  return kitSingleton;
}

export interface AppKitSwapAmount {
  amount: string;
  token: string;
}

export interface AppKitSwapFee {
  token: string;
  amount: string;
  type: string;
}

export interface AppKitSwapEstimate {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  estimatedOutput: AppKitSwapAmount;
  stopLimit: AppKitSwapAmount;
  fees: AppKitSwapFee[];
}

export interface AppKitSwapResult {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  txHash: string;
  explorerUrl: string;
  fees: AppKitSwapFee[];
  progress?: { status: string; substatus?: string; substatusMessage?: string };
}

/**
 * Builds a viem adapter from whatever EIP-1193 provider the currently
 * connected wallet exposes. `provider` should come straight from wagmi's
 * `connector.getProvider()` for a real external wallet connector
 * (WalletConnect, injected/auto-detected) — never from the circle-email
 * connector, whose provider only implements Circle's own challenge-signed
 * methods, not the full surface App Kit's viem adapter needs.
 */
export async function buildAppKitViemAdapter(provider: unknown) {
  return createViemAdapterFromProvider({ provider: provider as any });
}

type AppKitAdapter = Awaited<ReturnType<typeof buildAppKitViemAdapter>>;

const SWAP_SLIPPAGE_BPS = 300;

export async function estimateAppKitSwap(params: {
  adapter: AppKitAdapter;
  tokenIn: AppKitSwapToken;
  tokenOut: AppKitSwapToken;
  amountIn: string;
}): Promise<AppKitSwapEstimate> {
  const kit = getKit();
  const estimate = await kit.estimateSwap({
    from: { adapter: params.adapter, chain: "Arc_Testnet" },
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amountIn: params.amountIn,
    config: { slippageBps: SWAP_SLIPPAGE_BPS },
  });
  return estimate as unknown as AppKitSwapEstimate;
}

export async function executeAppKitSwap(params: {
  adapter: AppKitAdapter;
  tokenIn: AppKitSwapToken;
  tokenOut: AppKitSwapToken;
  amountIn: string;
}): Promise<AppKitSwapResult> {
  const kit = getKit();
  const result = await kit.swap({
    from: { adapter: params.adapter, chain: "Arc_Testnet" },
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    amountIn: params.amountIn,
    config: { slippageBps: SWAP_SLIPPAGE_BPS },
  });
  return result as unknown as AppKitSwapResult;
}
