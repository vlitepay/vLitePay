import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/rpc
 *
 * Transparent JSON-RPC proxy to Arc Testnet's public RPC. Exists because
 * that RPC doesn't reliably send CORS headers for direct browser requests
 * (see the comment on `arcTestnet` in lib/constants.ts — it's already known
 * to rate-limit/misbehave under browser-side polling). Rather than have
 * every client in the app hit https://rpc.testnet.arc.network directly and
 * risk a CORS failure, wagmi's transport (see lib/constants.ts) points at
 * this same-origin route instead — the actual request happens server-side,
 * where CORS doesn't apply, and we just forward the response verbatim.
 *
 * This is plain pass-through: no auth, no interpretation of the JSON-RPC
 * payload. Safe to expose publicly — it's exactly as sensitive as calling
 * the public RPC directly (which is already unauthenticated).
 */
const ARC_RPC_URL = process.env.ARC_RPC_URL || process.env.NEXT_PUBLIC_ARC_RPC_URL || "https://rpc.testnet.arc.network";

export async function POST(req: NextRequest) {
  const body = await req.text();

  try {
    const rpcRes = await fetch(ARC_RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
    });

    const text = await rpcRes.text();
    return new NextResponse(text, {
      status: rpcRes.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    // Mirror a JSON-RPC-shaped error so viem's error parsing still works
    // sensibly instead of surfacing a generic "unknown RPC error".
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32603, message: err?.message || "Could not reach Arc Testnet RPC" } },
      { status: 502 }
    );
  }
}
