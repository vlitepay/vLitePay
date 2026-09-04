import { NextRequest, NextResponse } from "next/server";
import { getStableFxTrade, isStableFxConfigured, StableFxApiError, StableFxNotConfiguredError } from "@/lib/stablefx";

/**
 * GET /api/stablefx/trades/[id]
 *
 * Step 5 of the swap flow: polled after funding is
 * submitted. Success is declared by the caller only once this reports a
 * completed status AND the wallet's EURC balance has actually increased —
 * this route just proxies Circle's status as-is, same config-gated / no-
 * fabrication pattern as every other StableFX route.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!isStableFxConfigured()) {
    return NextResponse.json(
      { error: "StableFX is not configured on this environment yet." },
      { status: 501 }
    );
  }

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "Trade id required." }, { status: 400 });
  }

  try {
    const trade = await getStableFxTrade(id);
    return NextResponse.json(trade);
  } catch (err) {
    if (err instanceof StableFxNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 501 });
    }
    if (err instanceof StableFxApiError) {
      return NextResponse.json(err.body, { status: err.status });
    }
    console.error("[stablefx/trades/:id] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Trade lookup failed." },
      { status: 502 }
    );
  }
}
