import { NextRequest, NextResponse } from "next/server";
import { createProfileNonce } from "@/lib/profile-nonce";

/**
 * GET /api/profile/nonce?wallet=0x...
 *
 * Foundation-only endpoint: issues a fresh, short-lived message for
 * `wallet` to sign via personal_sign, using lib/profile-nonce.ts's
 * in-memory store (see that file's comments on its production caveats).
 *
 * This is step 1 of the intended future write flow for POST
 * /api/profile — NOT wired up yet:
 *   1. Client calls this route to get { message }.               <- this file
 *   2. Client signs `message` with the wallet (personal_sign).
 *   3. Client POSTs { wallet, message, signature, ...fields } to
 *      /api/profile, which will call consumeProfileNonce() then
 *      verifyWalletSignature() before trusting the write.
 * The existing POST /api/profile handler still returns 501 and does not
 * call any of this yet — that wiring is a separate future step.
 *
 * Nothing in the frontend calls this route yet.
 */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json(
      { error: "Missing required `wallet` search param" },
      { status: 400 }
    );
  }

  const message = createProfileNonce(wallet);

  return NextResponse.json({ message });
}
