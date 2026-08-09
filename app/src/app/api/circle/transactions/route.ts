import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/circle/transactions
 * Header: X-User-Token: <userToken>
 *
 * Lists this user's most recent transactions, newest first.
 *
 * Why this exists: Circle's Web SDK execute() callback (lib/circleConnector.ts)
 * is documented to return a signature directly for signing challenges
 * (`result.data.signature`), but does NOT reliably expose the created
 * transaction's id for a transaction-type challenge (contractExecution,
 * transfer) across SDK versions — that was causing "Circle did not return
 * a transaction id to track" immediately after a successful on-chain
 * confirmation via the Circle popup. Rather than depend on guessing the
 * exact field path, the connector falls back to this endpoint: list this
 * user's transactions (same X-User-Token scoping already proven in
 * /api/circle/wallets) sorted by most recent, and cross-check createDate
 * against when the challenge was submitted to make sure it's picking up
 * the right one.
 *
 * Circle API: GET https://api.circle.com/v1/w3s/transactions
 * Docs: https://developers.circle.com/api-reference/wallets/user-controlled-wallets/list-transactions
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
    const url = new URL("https://api.circle.com/v1/w3s/transactions");
    url.searchParams.set("pageSize", "10");
    url.searchParams.set("order", "DESC");

    const circleRes = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${process.env.CIRCLE_API_KEY}`,
        "X-User-Token": userToken,
      },
    });

    const payload = await circleRes.json().catch(() => null);

    if (!circleRes.ok) {
      return NextResponse.json(payload ?? { error: "Circle rejected the transactions request" }, {
        status: circleRes.status,
      });
    }

    const transactions = payload?.data?.transactions ?? [];
    return NextResponse.json({
      transactions: transactions.map((t: any) => ({
        id: t.id,
        walletId: t.walletId ?? null,
        state: t.state,
        txHash: t.txHash ?? null,
        errorReason: t.errorReason ?? null,
        createDate: t.createDate ?? null,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not reach Circle" }, { status: 502 });
  }
}
