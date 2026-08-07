import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/circle/transactions/[id]
 * Header: X-User-Token: <userToken>
 *
 * Circle's execute() callback for a transaction challenge (as opposed to a
 * signing challenge) does NOT return an on-chain txHash directly — it just
 * confirms the challenge was submitted, along with Circle's own internal
 * transaction id. The actual txHash only becomes available once Circle has
 * broadcast the transaction and it's been picked up on-chain, which this
 * endpoint polls for (see lib/circleConnector.ts).
 *
 * Circle API: GET https://api.circle.com/v1/w3s/transactions/{id}
 * Docs: https://developers.circle.com/api-reference/wallets/user-controlled-wallets/get-transaction
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userToken = req.headers.get("x-user-token");

  if (!userToken) {
    return NextResponse.json({ error: "X-User-Token header required" }, { status: 400 });
  }
  if (!id) {
    return NextResponse.json({ error: "Transaction id required" }, { status: 400 });
  }

  if (!process.env.CIRCLE_API_KEY) {
    return NextResponse.json(
      { error: "Circle API key not configured on this environment yet" },
      { status: 501 }
    );
  }

  try {
    const circleRes = await fetch(`https://api.circle.com/v1/w3s/transactions/${id}`, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
        "X-User-Token": userToken,
      },
    });

    const payload = await circleRes.json().catch(() => null);

    if (!circleRes.ok) {
      return NextResponse.json(payload ?? { error: "Circle rejected the transaction lookup" }, {
        status: circleRes.status,
      });
    }

    const transaction = payload?.data?.transaction ?? payload?.transaction ?? null;
    if (!transaction) {
      return NextResponse.json({ error: "Unexpected response from Circle" }, { status: 502 });
    }

    return NextResponse.json({
      state: transaction.state,
      txHash: transaction.txHash ?? null,
      errorReason: transaction.errorReason ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not reach Circle" }, { status: 502 });
  }
}
