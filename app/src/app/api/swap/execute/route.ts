import { NextRequest } from "next/server";
import { APPKIT_SWAP_TOKENS, AppKitSwapToken } from "@/lib/constants";
import {
  buildCircleUserWalletAdapter,
  executeAppKitSwapForCircleWallet,
  isAppKitCircleAdapterConfigured,
} from "@/lib/appKitSwapServer";

// Circle Digital Wallets only. This is a genuinely long-running request —
// App Kit's server-side adapter creates a Circle challenge mid-swap, the
// client has to solve it via the SDK's PIN/biometric modal in the
// browser, and this handler keeps the connection open the whole time,
// streaming events out as they happen rather than blocking silently:
//   {"type":"challenge","challengeId":"..."}  — as soon as App Kit creates it
//   {"type":"result", ok:true, txHash, ...}   — only once a real txHash exists
//   {"type":"error","error":"..."}            — any failure, at any point
// Allow more time than the default serverless limit for the PIN prompt +
// on-chain confirmation to complete.
export const maxDuration = 120;

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function POST(req: NextRequest) {
  if (!isAppKitCircleAdapterConfigured()) {
    return jsonError("Circle API key not configured on this environment yet.", 501);
  }

  const body = await req.json().catch(() => null);
  const { tokenIn, tokenOut, amountIn, stopLimit, userToken } = body ?? {};

  if (!APPKIT_SWAP_TOKENS.includes(tokenIn) || !APPKIT_SWAP_TOKENS.includes(tokenOut)) {
    return jsonError("tokenIn/tokenOut must be USDC, EURC, or cirBTC.", 400);
  }
  if (tokenIn === tokenOut) {
    return jsonError("tokenIn and tokenOut must differ.", 400);
  }
  if (!amountIn || typeof amountIn !== "string" || Number(amountIn) <= 0) {
    return jsonError("amountIn must be a positive amount string.", 400);
  }
  if (!userToken || typeof userToken !== "string") {
    return jsonError("No live Circle session — this route is for Circle Digital Wallets only.", 401);
  }

  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
  });

  function send(event: Record<string, unknown>) {
    streamController?.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
  }

  (async () => {
    try {
      const adapter = await buildCircleUserWalletAdapter({
        userToken,
        onChallenge: ({ challengeId }) => {
          // Pushed to the client immediately — it solves this via the
          // existing Circle SDK PIN/biometric flow (same mechanism Send/
          // P2P use), not a new/second OTP UI.
          send({ type: "challenge", challengeId });
        },
      });

      const result = await executeAppKitSwapForCircleWallet({
        adapter,
        tokenIn: tokenIn as AppKitSwapToken,
        tokenOut: tokenOut as AppKitSwapToken,
        amountIn,
        stopLimit: typeof stopLimit === "string" ? stopLimit : undefined,
      });

      const txHash = (result as any)?.txHash;
      if (!txHash) {
        // Never report success without a real hash.
        send({ type: "error", error: "Swap did not return a transaction hash — treating this as failed." });
      } else {
        send({
          type: "result",
          ok: true,
          engine: "appkit",
          txHash,
          explorerUrl: (result as any)?.explorerUrl ?? `https://testnet.arcscan.app/tx/${txHash}`,
          tokenIn: (result as any)?.tokenIn ?? tokenIn,
          tokenOut: (result as any)?.tokenOut ?? tokenOut,
          amountIn: (result as any)?.amountIn ?? amountIn,
          amountOut: (result as any)?.amountOut,
        });
      }
    } catch (err) {
      console.error("[swap/execute] failed:", err);
      send({ type: "error", error: err instanceof Error ? err.message : "Swap couldn't be completed." });
    } finally {
      try {
        streamController?.close();
      } catch {
        // already closed
      }
    }
  })();

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}