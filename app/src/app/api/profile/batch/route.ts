import { NextRequest, NextResponse } from "next/server";
import { getAvatarsByWallets } from "@/lib/supabase-profile";

/**
 * GET /api/profile/batch?wallets=0xabc...,0xdef...
 *
 * Batched counterpart to GET /api/profile — resolves avatars for many
 * wallet addresses in one request, for P2P offer lists (many merchant
 * cards rendered at once). Public, unauthenticated read, same as the
 * single-wallet GET /api/profile — profiles.avatar_url is not sensitive
 * data and the table's RLS policy already allows public SELECT.
 *
 * Purpose-built minimal response shape (just avatars, not full profile
 * rows) — this endpoint exists solely to make merchant-uploaded avatars
 * visible to every viewer on offer cards/detail headers, not as a general
 * profile-batch API.
 *
 * Returns `{ avatars: Record<string, string> }` keyed by lowercased wallet
 * address; an address with no avatar (or no profile at all) is simply
 * absent from the map — callers should treat a missing key as "show the
 * initials fallback."
 */
export async function GET(req: NextRequest) {
  const walletsParam = req.nextUrl.searchParams.get("wallets");

  if (!walletsParam) {
    return NextResponse.json({ avatars: {} });
  }

  const wallets = walletsParam
    .split(",")
    .map((w) => w.trim())
    .filter(Boolean);

  const avatars = await getAvatarsByWallets(wallets);

  return NextResponse.json({ avatars });
}
