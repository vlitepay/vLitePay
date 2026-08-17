import { NextRequest, NextResponse } from "next/server";
import { getProfileByWallet } from "@/lib/supabase-profile";
import { upsertProfile } from "@/lib/supabase-profile-write";
import { consumeProfileNonce } from "@/lib/profile-nonce";
import { verifyWalletSignature } from "@/lib/verify-wallet-signature";
import type { ProfileUpdate } from "@/lib/types/database";

/**
 * GET /api/profile?wallet=0x...
 * POST /api/profile
 *
 * GET is read-only: looks up a profile row by wallet address via
 * lib/supabase-profile.ts (anon client, RLS-gated public SELECT).
 *
 * POST performs a real, verified write. See the security-order comment
 * above the POST handler below — do not reorder those steps.
 *
 * Nothing in the frontend calls either handler yet — useProfileStore
 * remains the live source of truth until a sync layer is deliberately
 * built on top of this route.
 *
 * GET is safe by construction: if Supabase isn't configured, or the table
 * is empty, or the wallet has no row, GET returns `{ profile: null }` with
 * a 200 — never a hard failure the frontend would need to special-case.
 */
export async function GET(req: NextRequest) {
  const wallet = req.nextUrl.searchParams.get("wallet");

  if (!wallet) {
    return NextResponse.json(
      { error: "Missing required `wallet` search param" },
      { status: 400 }
    );
  }

  const profile = await getProfileByWallet(wallet);

  return NextResponse.json({ profile });
}

/**
 * POST /api/profile
 * Body: {
 *   wallet: string;
 *   message: string;    // the exact string returned by GET /api/profile/nonce
 *   signature: string;
 *   avatar_url?, bio?, socials?, bank_details?, email?  // optional profile fields
 * }
 *
 * SECURITY ORDER — do not reorder or skip any step:
 *   1. Validate required fields are present (400 if not).
 *   2. consumeProfileNonce(wallet, message) — confirms `message` is the
 *      current, unexpired, single-use nonce for `wallet` and invalidates
 *      it immediately (prevents replay: this same message can never be
 *      accepted again, whether this request succeeds or fails past this
 *      point). Reject (401) before ever looking at the signature if this
 *      fails — an invalid/expired/replayed nonce means there's nothing to
 *      verify a signature against.
 *   3. verifyWalletSignature({ wallet, message, signature }) — confirms
 *      `signature` is a valid personal_sign (or EIP-1271) signature over
 *      `message`, produced by `wallet`. Only after both 2 and 3 pass do we
 *      trust that this request genuinely comes from `wallet`'s owner.
 *   4. Sanitize the body down to exactly the allowed ProfileUpdate fields
 *      (avatar_url, bio, socials, bank_details, email) before upserting —
 *      never spread the raw body into the database call, since it could
 *      contain wallet_address/id/created_at/updated_at or arbitrary keys.
 *   5. upsertProfile(wallet, sanitized) — service-role write, only reached
 *      once ownership is verified.
 */
const ALLOWED_PROFILE_FIELDS = [
  "avatar_url",
  "bio",
  "socials",
  "bank_details",
  "email",
] as const;

function sanitizeProfileFields(body: Record<string, unknown>): ProfileUpdate {
  const sanitized: ProfileUpdate = {};

  for (const field of ALLOWED_PROFILE_FIELDS) {
    if (field in body) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (sanitized as any)[field] = body[field];
    }
  }

  return sanitized;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  // 1. Validate required fields.
  if (
    !body ||
    typeof body.wallet !== "string" ||
    !body.wallet ||
    typeof body.message !== "string" ||
    !body.message ||
    typeof body.signature !== "string" ||
    !body.signature
  ) {
    return NextResponse.json(
      { error: "Missing required `wallet`, `message`, or `signature` field in request body" },
      { status: 400 }
    );
  }

  const { wallet, message, signature } = body as {
    wallet: string;
    message: string;
    signature: string;
  };

  // 2. Nonce must be valid, unexpired, and not already consumed. This
  // check runs — and invalidates the nonce — before signature
  // verification, regardless of outcome, so a given message can never be
  // checked twice.
  const nonceValid = consumeProfileNonce(wallet, message);
  if (!nonceValid) {
    return NextResponse.json(
      { error: "Invalid, expired, or already-used nonce. Request a new one from GET /api/profile/nonce." },
      { status: 401 }
    );
  }

  // 3. Signature must genuinely be `wallet` signing exactly `message`.
  const { valid, error: verifyError } = await verifyWalletSignature({
    wallet,
    message,
    signature,
  });
  if (!valid) {
    return NextResponse.json(
      { error: "Signature verification failed", detail: verifyError },
      { status: 401 }
    );
  }

  // 4. Only allowed fields, never the raw body, reach the database.
  const sanitized = sanitizeProfileFields(body as Record<string, unknown>);

  // 5. Ownership is verified — perform the write.
  const profile = await upsertProfile(wallet, sanitized);

  if (!profile) {
    return NextResponse.json(
      { error: "Profile write failed. Supabase may be unavailable — try again shortly." },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile });
}

