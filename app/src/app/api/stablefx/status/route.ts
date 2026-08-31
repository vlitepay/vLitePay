import { NextResponse } from "next/server";
import { isStableFxConfigured } from "@/lib/stablefx";

/**
 * GET /api/stablefx/status
 *
 * Lets the Swap tab know, before rendering anything interactive, whether
 * StableFX is actually usable on this environment. STABLEFX_API_KEY is a
 * server secret so the client can't check it directly — this is the one
 * network round trip the Swap tab makes on mount to decide whether to show
 * the live quote form or the disabled state with explanatory copy.
 */
export async function GET() {
  return NextResponse.json({ configured: isStableFxConfigured() });
}
