import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/circle/wallets
 * Header: X-User-Token: <userToken>
 *
 * Final step of Circle's User-Controlled Wallets email OTP flow: once a
 * wallet-creation challenge has been executed (or the user already had a
 * wallet), this lists the user's wallets so we can read the address that
 * gets wired into wagmi (see lib/circle.ts, lib/circleConnector.ts).
 *
 * Circle API: GET https://api.circle.com/v1/w3s/wallets
 * Docs: https://developers.circle.com/w3s/authentication-methods
 */
export async function GET(req: NextRequest) {
  const userToken = req.headers.get("x-user-token");

  if (!userToken) {
    return NextResponse.json({ error: "X-User-Token header required" }, { status: 400 });
  }

  if (!process.env.CIRCLE_API_KEY) {
    return NextResponse.json(
      { error: "Circle API key not configured on this environment yet" },
      { status: 501 }
    );
  }

  try {
    const circleRes = await fetch("https://api.circle.com/v1/w3s/wallets", {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
        "X-User-Token": userToken,
      },
    });

    const payload = await circleRes.json().catch(() => null);

    if (!circleRes.ok) {
      return NextResponse.json(payload ?? { error: "Circle rejected the wallets request" }, {
        status: circleRes.status,
      });
    }

    const wallets = payload?.data?.wallets ?? payload?.wallets ?? [];
    return NextResponse.json({ wallets });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not reach Circle" }, { status: 502 });
  }
}
