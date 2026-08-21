import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/circle/social-session
 * Body: { deviceId: string }
 *
 * Step 1 of Circle User-Controlled Wallets social (Google) login: obtains
 * the { deviceToken, deviceEncryptionKey } pair the client-side Circle Web
 * SDK's updateConfigs() needs before calling performLogin() — Circle's
 * LoginConfigs type requires these for every login method, not just email
 * OTP (see lib/circle.ts's startGoogleLogin/completePendingGoogleLogin for
 * the full flow).
 *
 * Endpoint confirmed correct against Circle's official reference
 * implementation (developers.circle.com/wallets/user-controlled/
 * build-a-wallet-app, "Social login" tab, fetched and verified directly) —
 * POST /v1/w3s/users/social/token, body { idempotencyKey, deviceId },
 * response { data: { deviceToken, deviceEncryptionKey } }. This was
 * initially (incorrectly) implemented reusing the email endpoint minus its
 * `email` field, which Circle rejected — that guess is why this comment
 * used to carry a verification warning; it's now confirmed, not guessed.
 *
 * Fails gracefully (clear error, never a crash) if CIRCLE_API_KEY is unset
 * or Circle rejects the request — matches app/api/circle/session's
 * existing 501/error-passthrough pattern exactly.
 */
export async function POST(req: NextRequest) {
  const { deviceId } = await req.json().catch(() => ({}));

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
    const circleRes = await fetch("https://api.circle.com/v1/w3s/users/social/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
      },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        deviceId,
      }),
    });

    const payload = await circleRes.json().catch(() => null);

    if (!circleRes.ok) {
      return NextResponse.json(
        {
          error:
            payload?.message ||
            "Google sign-in isn't available yet — this may need Circle Console configuration. Try email instead.",
        },
        { status: circleRes.status }
      );
    }

    const result = payload?.data ?? payload ?? {};
    const { deviceToken, deviceEncryptionKey } = result;

    if (!deviceToken || !deviceEncryptionKey) {
      return NextResponse.json({ error: "Unexpected response from Circle" }, { status: 502 });
    }

    return NextResponse.json({ deviceToken, deviceEncryptionKey });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not reach Circle" }, { status: 502 });
  }
}
