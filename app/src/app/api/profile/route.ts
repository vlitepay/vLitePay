import { NextRequest, NextResponse } from "next/server";
import { getProfileByWallet } from "@/lib/supabase-profile";
import { upsertProfile } from "@/lib/supabase-profile-write";
import type { ProfileUpdate } from "@/lib/types/database";

/**
 * GET /api/profile?wallet=0x...
 * POST /api/profile
 *
 * GET is read-only: looks up a profile row by wallet address via
 * lib/supabase-profile.ts (anon client, RLS-gated public SELECT).
 *
 * POST upserts by wallet address, taken directly from the request body.
 * Testnet, no auth: no nonce, no personal_sign, no tx, no session/token
 * check of any kind — this must work identically for a Circle-login wallet
 * and a WalletConnect/injected wallet, and neither of those has a server-
 * verifiable "session" this route could check anyway.
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
 *   avatar_url?, bio?, socials?
 * }
 *
 *   1. Validate `wallet` is present (400 if not).
 *   2. Sanitize the body down to exactly the allowed fields — avatar_url,
 *      bio, socials. bank_details and email are never written by this
 *      route (email has its own separate, narrower endpoint:
 *      /api/profile/email; bank details stay local-only/BankDetailsEditor).
 *   3. upsertProfile(wallet, sanitized) — matches that helper's real
 *      signature: (walletAddress: string, data: ProfileUpdate).
 */
const ALLOWED_PROFILE_FIELDS = ["avatar_url", "bio", "socials"] as const;

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

  // 1. Validate required field.
  if (!body || typeof body.wallet !== "string" || !body.wallet) {
    return NextResponse.json(
      { error: "Missing required `wallet` field in request body" },
      { status: 400 }
    );
  }

  const { wallet } = body as { wallet: string };

  // 2. Only allowed fields, never the raw body, reach the database.
  const sanitized = sanitizeProfileFields(body as Record<string, unknown>);

  // 3. Perform the write.
  const profile = await upsertProfile(wallet, sanitized);

  if (!profile) {
    return NextResponse.json(
      { error: "Profile write failed. Supabase may be unavailable — try again shortly." },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile });
}
