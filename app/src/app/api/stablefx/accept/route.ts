import { NextRequest, NextResponse } from "next/server";
import { acceptStableFxQuote, isHexString, isStableFxConfigured, StableFxApiError, StableFxNotConfiguredError } from "@/lib/stablefx";

/**
 * POST /api/stablefx/accept
 * Body: { quoteId: string, address: `0x${string}`, message: object, signature: `0x${string}` }
 *
 * `address` is the connected wallet that signed. `message` is
 * `quote.typedData.message` from GET-quote, UNCHANGED — including its
 * witness (consideration/recipient/fee/authorizer) — never rebuilt or
 * partially reconstructed here; this route just validates it's present
 * and forwards it wholesale to acceptStableFxQuote (see lib/stablefx.ts
 * for the exact Circle Create Trade payload). 501s with no execution if
 * StableFX isn't configured — this route never submits a transaction
 * itself and never fabricates a txHash.
 */
export async function POST(req: NextRequest) {
  if (!isStableFxConfigured()) {
    return NextResponse.json(
      { error: "StableFX is not configured on this environment yet." },
      { status: 501 }
    );
  }

  const body = await req.json().catch(() => null);
  const { quoteId, address, message, signature } = body ?? {};

  if (!quoteId || typeof quoteId !== "string") {
    return NextResponse.json({ error: "quoteId required." }, { status: 400 });
  }
  if (!isHexString(address)) {
    return NextResponse.json({ error: "address must be a 0x wallet address." }, { status: 400 });
  }
  if (!message || typeof message !== "object" || Array.isArray(message)) {
    return NextResponse.json(
      { error: "message (the quote's typedData.message, unmodified) is required." },
      { status: 400 }
    );
  }
  if (!isHexString(signature)) {
    return NextResponse.json({ error: "signature must be a 0x-prefixed string." }, { status: 400 });
  }

  try {
    const result = await acceptStableFxQuote({ quoteId, address, message, signature });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof StableFxNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 501 });
    }
    if (err instanceof StableFxApiError) {
      return NextResponse.json(err.body, { status: err.status });
    }
    console.error("[stablefx/accept] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Accept request failed." },
      { status: 502 }
    );
  }
}
