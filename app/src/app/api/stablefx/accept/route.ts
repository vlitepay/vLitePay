import { NextRequest, NextResponse } from "next/server";
import { acceptStableFxQuote, isHexString, isStableFxConfigured, StableFxNotConfiguredError } from "@/lib/stablefx";

/**
 * POST /api/stablefx/accept
 * Body: { quoteId: string, permit: StableFxPermit2Payload, signature: `0x${string}` }
 *
 * Forwards the user's Permit2 signature (see hooks/useStableFx.ts — signed
 * client-side via wagmi's useSignTypedData, never leaves the browser
 * unsigned) to Circle so FxEscrow can pull both legs of the swap and settle
 * PvP on-chain. 501s with no execution if StableFX isn't configured — this
 * route never submits a transaction itself and never fabricates a txHash.
 */
export async function POST(req: NextRequest) {
  if (!isStableFxConfigured()) {
    return NextResponse.json(
      { error: "StableFX is not configured on this environment yet." },
      { status: 501 }
    );
  }

  const body = await req.json().catch(() => null);
  const { quoteId, permit, signature } = body ?? {};

  if (!quoteId || typeof quoteId !== "string") {
    return NextResponse.json({ error: "quoteId required." }, { status: 400 });
  }
  if (!permit || typeof permit !== "object") {
    return NextResponse.json({ error: "permit payload required." }, { status: 400 });
  }
  const { domain, permitted, spender, nonce, deadline } = permit;
  if (
    !domain ||
    typeof domain.name !== "string" ||
    typeof domain.chainId !== "number" ||
    !isHexString(domain.verifyingContract)
  ) {
    return NextResponse.json({ error: "permit.domain is invalid." }, { status: 400 });
  }
  if (!permitted || !isHexString(permitted.token) || typeof permitted.amount !== "string") {
    return NextResponse.json({ error: "permit.permitted is invalid." }, { status: 400 });
  }
  if (!isHexString(spender)) {
    return NextResponse.json({ error: "permit.spender must be a 0x address." }, { status: 400 });
  }
  if (typeof nonce !== "string" || typeof deadline !== "string") {
    return NextResponse.json({ error: "permit.nonce/deadline must be strings." }, { status: 400 });
  }
  if (!isHexString(signature)) {
    return NextResponse.json({ error: "signature must be a 0x-prefixed string." }, { status: 400 });
  }

  try {
    const result = await acceptStableFxQuote({
      quoteId,
      permit: {
        domain: { name: domain.name, chainId: domain.chainId, verifyingContract: domain.verifyingContract },
        permitted: { token: permitted.token, amount: permitted.amount },
        spender,
        nonce,
        deadline,
      },
      signature,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof StableFxNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 501 });
    }
    console.error("[stablefx/accept] failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Accept request failed." },
      { status: 502 }
    );
  }
}

