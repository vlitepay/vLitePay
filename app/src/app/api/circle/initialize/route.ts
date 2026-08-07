import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/circle/initialize
 * Body: { userToken: string }
 *
 * Step 3 of Circle's User-Controlled Wallets flow (after email OTP
 * verification has produced a userToken/encryptionKey): initializes the
 * Circle user and returns a challengeId that the client-side Circle Web
 * SDK executes (sdk.execute(challengeId, ...)) to actually create the
 * wallet, prompting the user through Circle's hosted approval UI.
 *
 * Circle API: POST https://api.circle.com/v1/w3s/user/initialize
 * Docs: https://developers.circle.com/w3s/authentication-methods
 *
 * If the user already has a wallet, Circle returns error code 155106
 * ("user already initialized") — that's passed straight through with its
 * original status so the caller can skip straight to listing the existing
 * wallet (see /api/circle/wallets) instead of treating it as a failure.
 */
export async function POST(req: NextRequest) {
  const { userToken } = await req.json();

  if (!userToken) {
    return NextResponse.json({ error: "userToken required" }, { status: 400 });
  }

  if (!process.env.CIRCLE_API_KEY) {
    return NextResponse.json(
      { error: "Circle API key not configured on this environment yet" },
      { status: 501 }
    );
  }

  try {
    const circleRes = await fetch("https://api.circle.com/v1/w3s/user/initialize", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
        "X-User-Token": userToken,
      },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        accountType: "SCA",
        blockchains: ["ARC-TESTNET"],
      }),
    });

    const payload = await circleRes.json().catch(() => null);

    if (!circleRes.ok) {
      // Pass through Circle's error payload as-is (including `code`, e.g.
      // 155106 for "user already initialized") so the caller can branch on it.
      return NextResponse.json(payload ?? { error: "Circle rejected the initialize request" }, {
        status: circleRes.status,
      });
    }

    const { challengeId } = payload?.data ?? payload ?? {};

    if (!challengeId) {
      return NextResponse.json({ error: "Unexpected response from Circle" }, { status: 502 });
    }

    return NextResponse.json({ challengeId });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not reach Circle" }, { status: 502 });
  }
}
