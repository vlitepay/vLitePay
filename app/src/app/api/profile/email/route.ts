import { NextRequest, NextResponse } from "next/server";
import { setProfileEmailIfMissing } from "@/lib/supabase-profile-email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/profile/email
 * Body: { wallet: string, email: string }
 *
 * Persists the email captured at Circle login time onto the wallet's
 * profile — but only if one isn't already stored (see
 * lib/supabase-profile-email.ts's setProfileEmailIfMissing).
 *
 * NO SIGNATURE REQUIRED — deliberate, same reasoning already applied to
 * chat/evidence in this codebase (removing unnecessary signature popups for
 * low-stakes, non-chain actions): this endpoint can ONLY ever move a
 * profile's email from "unset" to a value, never overwrite an existing one
 * or touch any other field (bank_details, avatar_url, etc. are never
 * included in the write). In practice this is only ever called from
 * ConnectScreen.tsx immediately after a real Circle-authenticated login —
 * Circle's own login flow (OTP verification / Google OAuth) already proved
 * control of the wallet before this fires; requiring a second, separate
 * wallet signature just to jot down an email Circle just handed us would be
 * redundant friction for a field this low-sensitivity.
 *
 * Fails gracefully — a missing/invalid email or unavailable Supabase never
 * throws or blocks login; the caller (ConnectScreen) treats this as
 * fire-and-forget and never surfaces its failure to the user.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);

  const wallet = body?.wallet;
  const email = body?.email;

  if (typeof wallet !== "string" || !wallet) {
    return NextResponse.json({ error: "Missing required `wallet` field" }, { status: 400 });
  }
  if (typeof email !== "string" || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Missing or invalid `email` field" }, { status: 400 });
  }

  const profile = await setProfileEmailIfMissing(wallet, email);

  if (!profile) {
    return NextResponse.json(
      { error: "Could not save email. Supabase may be unavailable." },
      { status: 500 }
    );
  }

  return NextResponse.json({ profile });
}
