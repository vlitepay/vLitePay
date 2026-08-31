import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/circle/token/refresh
 * Body: { userToken: string; refreshToken: string; deviceId: string }
 *
 * Circle API: POST https://api.circle.com/v1/w3s/users/token/refresh
 * Headers: Authorization: Bearer CIRCLE_API_KEY, X-User-Token: <current userToken>
 * Body: { idempotencyKey, refreshToken, deviceId }
 * Response: { data: { userToken, encryptionKey, refreshToken } } — a brand
 * new triple, all three of which must be persisted (see lib/circleSession.ts)
 * and handed to sdk.setAuthentication({ userToken, encryptionKey }).
 *
 * Fixes stale email/Google User-Controlled Wallet sessions after hours of
 * inactivity — previously the only recovery was a full logout/login.
 * Called from lib/circleTokenRefresh.ts, both on a periodic timer while the
 * app is open and right before a signing challenge if the session looks
 * stale, or after Circle's expired-token error (155104).
 *
 * Same conventions as every other app/api/circle/* route: CIRCLE_API_KEY
 * never leaves the server, 501s clearly if it's unset, and Circle's error
 * `code` is passed through so the client can distinguish an expired
 * refresh token (unrecoverable — user must sign in again) from a
 * transient failure.
 */
export async function POST(req: NextRequest) {
  const { userToken, refreshToken, deviceId } = await req.json().catch(() => ({}));

  if (!userToken || !refreshToken || !deviceId) {
    return NextResponse.json(
      { error: "userToken, refreshToken, and deviceId are all required" },
      { status: 400 }
    );
  }

  if (!process.env.CIRCLE_API_KEY) {
    return NextResponse.json(
      { error: "Circle API key not configured on this environment yet" },
      { status: 501 }
    );
  }

  try {
    const circleRes = await fetch("https://api.circle.com/v1/w3s/users/token/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
        "X-User-Token": userToken,
      },
      body: JSON.stringify({
        idempotencyKey: crypto.randomUUID(),
        refreshToken,
        deviceId,
      }),
    });

    const payload = await circleRes.json().catch(() => null);

    if (!circleRes.ok) {
      return NextResponse.json(
        { error: payload?.message || "Circle rejected the session refresh", code: payload?.code },
        { status: circleRes.status }
      );
    }

    // Circle wraps successful responses as { data: {...} }.
    const result = payload?.data ?? payload ?? {};
    const { userToken: newUserToken, encryptionKey, refreshToken: newRefreshToken } = result;

    if (!newUserToken || !encryptionKey || !newRefreshToken) {
      return NextResponse.json({ error: "Unexpected response from Circle" }, { status: 502 });
    }

    return NextResponse.json({ userToken: newUserToken, encryptionKey, refreshToken: newRefreshToken });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not reach Circle" }, { status: 502 });
  }
}
