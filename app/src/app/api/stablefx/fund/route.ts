import { NextRequest, NextResponse } from "next/server";
import { submitStableFxFunding, isHexString, isStableFxConfigured, StableFxApiError, StableFxNotConfiguredError } from "@/lib/stablefx";

/**
 * POST /api/stablefx/fund
 * Body: { signature: `0x${string}`, permit2: object }
 *
 * Step 4 of the swap flow: submits the taker's signature of the funding
 * typedData from /api/stablefx/fund/presign. `permit2` is that typedData's
 * `message` field, forwarded completely unmodified — this route only
 * checks it's present, never reads or rebuilds any field inside it.
 */
export async function POST(req: NextRequest) {
  if (!isStableFxConfigured()) {
    return NextResponse.json(
      { error: "StableFX is not configured on this environment yet." },
      { status: 501 }
    );
  }

  const body = await req.json().catch(() => null);
  const { signature, permit2 } = body ?? {};

  if (!isHexString(signature)) {
    return NextResponse.json({ error: "signature must be a 0x-prefixed string." }, { status: 400 });
  }
  if (!permit2 || typeof permit2 !== "object" || Array.isArray(permit2)) {
    return NextResponse.json(
      { error: "permit2 (the funding typedData.message, unmodified) is required." },
      { status: 400 }
    );
  }

  try {
    const result = await submitStableFxFunding({ signature, permit2 });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof StableFxNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 501 });
    }
    if (err instanceof StableFxApiError) {
      return NextResponse.json(err.body, { status: err.status });
    }
    console.error("[stablefx/fund] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Funding submission failed." },
      { status: 502 }
    );
  }
}
