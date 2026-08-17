import { NextRequest, NextResponse } from "next/server";
import { createEvidenceNonce } from "@/lib/evidence-nonce";

/**
 * GET /api/evidence/nonce?wallet=0x...
 *
 * Issues a fresh, short-lived message for `wallet` to sign via
 * personal_sign, using lib/evidence-nonce.ts's in-memory store. Step 1 of
 * the upload flow (mirrors GET /api/profile/nonce for the profile write
 * path):
 *   1. Client calls this route to get { message }.               <- this file
 *   2. Client signs `message` with the wallet (personal_sign).
 *   3. Client POSTs the file + { wallet, message, signature } as
 *      multipart/form-data to POST /api/evidence/upload, which verifies
 *      both before uploading to the private `evidence` bucket.
 *
 * Not wired into any dispute/chat UI yet — foundation only.
 */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json(
      { error: "Missing required `wallet` search param" },
      { status: 400 }
    );
  }

  const message = createEvidenceNonce(wallet);

  return NextResponse.json({ message });
}
