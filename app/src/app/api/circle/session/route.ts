import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/circle/session
 * Body: { email: string; deviceId: string }
 *
 * Step 1 of Circle's User-Controlled Wallets email OTP login: asks Circle to
 * email the user a one-time code, and returns the device credentials the
 * client-side Circle Web SDK needs to verify it.
 *
 * Circle API: POST https://api.circle.com/v1/w3s/users/email/token
 * Docs: https://developers.circle.com/w3s/create-your-first-wallet-with-email
 *
 * This intentionally does NOT return a wallet session yet — { deviceToken,
 * deviceEncryptionKey, otpToken } are passed straight through to the
 * client, which calls the Circle Web SDK's verifyOtp() with them to open
 * Circle's hosted OTP-entry UI. Once the user enters the code, the SDK's
 * login callback resolves with the actual userToken/encryptionKey (and,
 * after a separate wallet-initialization challenge, a wallet address) — see
 * lib/circle.ts for how that next step is wired.
 */
export async function POST(req: NextRequest) {
  const { email, deviceId } = await req.json();

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  }
  if (!deviceId) {
    return NextResponse.json({ error: "deviceId required" }, { status: 400 });
  }

  if (!process.env.CIRCLE_API_KEY) {
    return NextResponse.json(
      { error: "Circle API key not configured on this environment yet" },
      { status: 501 }
    );
  }

  try {
    const circleRes = await fetch("https://api.circle.com/v1/w3s/users/email/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
      },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        deviceId,
        email,
      }),
    });

    const payload = await circleRes.json().catch(() => null);

    if (!circleRes.ok) {
      return NextResponse.json(
        { error: payload?.message || "Circle rejected the email login request" },
        { status: circleRes.status }
      );
    }

    // Circle wraps successful responses as { data: {...} }.
    const result = payload?.data ?? payload ?? {};
    const { deviceToken, deviceEncryptionKey, otpToken } = result;

    if (!deviceToken || !deviceEncryptionKey) {
      return NextResponse.json({ error: "Unexpected response from Circle" }, { status: 502 });
    }

    return NextResponse.json({ deviceToken, deviceEncryptionKey, otpToken });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not reach Circle" }, { status: 502 });
  }
}
