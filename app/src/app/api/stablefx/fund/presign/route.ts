import { NextRequest, NextResponse } from "next/server";
import { presignStableFxFunding, isStableFxConfigured, StableFxApiError, StableFxNotConfiguredError } from "@/lib/stablefx";

/**
 * POST /api/stablefx/fund/presign
 * Body: { contractTradeId: string }
 *
 * Step 3 of the swap flow: after a trade is
 * created, this gets the second Permit2 typedData the taker must sign so
 * FxEscrow can actually pull their USDC — a normal on-chain authorization
 * against their existing Arc balance, not a sandbox deposit. Same
 * config-gated / no-fake-execution pattern as every other StableFX route.
 */
export async function POST(req: NextRequest) {
  if (!isStableFxConfigured()) {
    return NextResponse.json(
      { error: "StableFX is not configured on this environment yet." },
      { status: 501 }
    );
  }

  const body = await req.json().catch(() => null);
  const { contractTradeId } = body ?? {};

  if (!contractTradeId || typeof contractTradeId !== "string") {
    return NextResponse.json({ error: "contractTradeId required." }, { status: 400 });
  }

  try {
    const typedData = await presignStableFxFunding(contractTradeId);
    return NextResponse.json(typedData);
  } catch (err) {
    if (err instanceof StableFxNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 501 });
    }
    if (err instanceof StableFxApiError) {
      return NextResponse.json(err.body, { status: err.status });
    }
    console.error("[stablefx/fund/presign] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Funding presign failed." },
      { status: 502 }
    );
  }
}
