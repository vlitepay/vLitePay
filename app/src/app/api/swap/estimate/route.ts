import { NextRequest, NextResponse } from "next/server";
import { APPKIT_SWAP_TOKENS, AppKitSwapToken } from "@/lib/constants";
import {
  buildCircleUserWalletAdapter,
  estimateAppKitSwapForCircleWallet,
  isAppKitCircleAdapterConfigured,
} from "@/lib/appKitSwapServer";

/**
 * POST /api/swap/estimate
 * Body: { tokenIn, tokenOut, amountIn, userToken }
 *
 * Circle Digital Wallets (email/Google) only — the WalletConnect/injected
 * path estimates entirely client-side via the browser's own EIP-1193
 * provider (lib/appKitSwap.ts), since that's the one place a real,
 * verified adapter path exists for that wallet type without a server key.
 *
 * `userToken` comes from the client's existing Circle session (the same
 * one Send/P2P/etc. already send to /api/circle/challenge) — this route
 * has no independent server-side session store.
 *
 * Never fakes a quote: any Circle/App Kit error is surfaced as-is.
 */
export async function POST(req: NextRequest) {
  if (!isAppKitCircleAdapterConfigured()) {
    return NextResponse.json(
      { error: "Circle API key not configured on this environment yet." },
      { status: 501 }
    );
  }

  const body = await req.json().catch(() => null);
  const { tokenIn, tokenOut, amountIn, userToken } = body ?? {};

  if (!APPKIT_SWAP_TOKENS.includes(tokenIn) || !APPKIT_SWAP_TOKENS.includes(tokenOut)) {
    return NextResponse.json({ error: "tokenIn/tokenOut must be USDC, EURC, or cirBTC." }, { status: 400 });
  }
  if (tokenIn === tokenOut) {
    return NextResponse.json({ error: "tokenIn and tokenOut must differ." }, { status: 400 });
  }
  if (!amountIn || typeof amountIn !== "string" || Number(amountIn) <= 0) {
    return NextResponse.json({ error: "amountIn must be a positive amount string." }, { status: 400 });
  }
  if (!userToken || typeof userToken !== "string") {
    return NextResponse.json(
      { error: "No live Circle session — this route is for Circle Digital Wallets only." },
      { status: 401 }
    );
  }

  try {
    const adapter = await buildCircleUserWalletAdapter({
      userToken,
      // Estimating a quote should never need a signature — if App Kit
      // unexpectedly requests one here, surface that clearly rather than
      // silently hanging (there's no client listening for a challenge
      // event on the estimate call).
      onChallenge: ({ challengeId }) => {
        console.error("[swap/estimate] unexpected signing challenge during estimate:", challengeId);
      },
    });

    const estimate = await estimateAppKitSwapForCircleWallet({
      adapter,
      tokenIn: tokenIn as AppKitSwapToken,
      tokenOut: tokenOut as AppKitSwapToken,
      amountIn,
    });

    return NextResponse.json({ engine: "appkit", tokenIn, tokenOut, amountIn, ...(estimate as object) });
  } catch (err) {
    console.error("[swap/estimate] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Couldn't get a quote right now." },
      { status: 502 }
    );
  }
}
