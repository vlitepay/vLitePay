import { NextRequest, NextResponse } from "next/server";
import { getStableFxQuote, isHexString, isStableFxConfigured, StableFxApiError, StableFxNotConfiguredError } from "@/lib/stablefx";
import { SWAPPABLE_TOKENS, SwappableToken } from "@/lib/constants";

/**
 * POST /api/stablefx/quote
 * Body: { fromToken: "USDC"|"EURC", toToken: "USDC"|"EURC", amount: string (smallest units), walletAddress: `0x${string}` }
 *
 * Returns a live StableFX RFQ quote. Never fabricates a rate: if
 * STABLEFX_API_KEY / NEXT_PUBLIC_FX_ESCROW_ADDRESS aren't set, this returns
 * 501 with a clear message instead of any numeric fallback — the Swap tab
 * is expected to check GET /api/stablefx/status before ever calling this.
 */
export async function POST(req: NextRequest) {
  if (!isStableFxConfigured()) {
    return NextResponse.json(
      { error: "StableFX is not configured on this environment yet." },
      { status: 501 }
    );
  }

  const body = await req.json().catch(() => null);
  const { fromToken, toToken, amount, walletAddress } = body ?? {};

  if (!SWAPPABLE_TOKENS.includes(fromToken) || !SWAPPABLE_TOKENS.includes(toToken)) {
    return NextResponse.json({ error: "fromToken/toToken must be USDC or EURC (v1)." }, { status: 400 });
  }
  if (fromToken === toToken) {
    return NextResponse.json({ error: "fromToken and toToken must differ." }, { status: 400 });
  }
  if (!amount || typeof amount !== "string" || BigInt(amount) <= 0n) {
    return NextResponse.json({ error: "amount must be a positive smallest-unit string." }, { status: 400 });
  }
  if (!isHexString(walletAddress)) {
    return NextResponse.json({ error: "walletAddress required." }, { status: 400 });
  }

  try {
    const quote = await getStableFxQuote({
      fromToken: fromToken as SwappableToken,
      toToken: toToken as SwappableToken,
      amount,
      walletAddress,
    });
    return NextResponse.json(quote);
  } catch (err) {
    if (err instanceof StableFxNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 501 });
    }
    if (err instanceof StableFxApiError) {
      // Forward Circle's exact status + body rather than collapsing every
      // failure into a generic 502 — lets the caller see Circle's real
      // error code/message/errId directly.
      return NextResponse.json(err.body, { status: err.status });
    }
    console.error("[stablefx/quote] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Quote request failed." },
      { status: 502 }
    );
  }
}
