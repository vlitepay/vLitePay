import { NextRequest, NextResponse } from "next/server";
import { uploadEvidence } from "@/lib/supabase-evidence-upload";
import { isTradeParticipant } from "@/lib/verify-trade-participant";
import { EVIDENCE_UPLOAD_LIMITS } from "@/lib/constants";

/**
 * POST /api/evidence/upload
 * Body: multipart/form-data with fields:
 *   wallet: string
 *   tradeId: string (numeric)
 *   file: File
 *
 * Evidence upload is an OFF-CHAIN action — it only writes to Supabase
 * Storage, no contract call happens here. Per product decision, off-chain
 * actions should not prompt a wallet signature; only real on-chain writes
 * (like the raiseDispute transaction this evidence gets attached to, via
 * useEscrowActions in DisputeModal.tsx) should ask for a confirmation.
 * This route used to require a full nonce -> sign -> verify flow (same
 * shape as profile writes) — that's been replaced below with an on-chain
 * PARTICIPANT CHECK instead, which is what actually matters here: not "is
 * this genuinely wallet X" but "is wallet X allowed to attach evidence to
 * this specific trade." Profile sync (app/api/profile/route.ts) keeps its
 * signature requirement — that's a different, still-signed flow, not
 * touched by this change.
 *
 * ORDER:
 *   1. Validate required fields (400 if missing) and the file itself
 *      (size/type against EVIDENCE_UPLOAD_LIMITS — a clearer 400 than
 *      letting Supabase Storage's own bucket-level limit reject it).
 *   2. isTradeParticipant(tradeId, wallet) — confirms `wallet` is actually
 *      the on-chain buyer or seller of `tradeId` (same helper and same
 *      trade-off already accepted for chat — see
 *      app/api/chat/messages/route.ts's comments for the full reasoning:
 *      this is participant-gated, not signature-gated, which is
 *      meaningfully better than no check at all while staying fast enough
 *      not to need a wallet prompt for something as low-stakes as
 *      attaching a screenshot).
 *   3. Only after that passes: uploadEvidence() — service-role write to
 *      the private `evidence` bucket, path scoped under wallet + tradeId.
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Invalid or missing form data" }, { status: 400 });
  }

  const wallet = formData.get("wallet");
  const tradeIdRaw = formData.get("tradeId");
  const file = formData.get("file");

  // 1a. Required fields present and the right types.
  if (
    typeof wallet !== "string" ||
    !wallet ||
    typeof tradeIdRaw !== "string" ||
    !tradeIdRaw ||
    !(file instanceof File)
  ) {
    return NextResponse.json(
      { error: "Missing required `wallet`, `tradeId`, or `file` field" },
      { status: 400 }
    );
  }

  const tradeId = Number(tradeIdRaw);
  if (!Number.isFinite(tradeId)) {
    return NextResponse.json({ error: "`tradeId` must be a number" }, { status: 400 });
  }

  // 1b. File itself — size/type. Supabase's bucket-level limits (see the
  // storage SQL migration) would reject an invalid file too, but checking
  // here first gives a clearer, faster error.
  if (file.size > EVIDENCE_UPLOAD_LIMITS.maxSizeBytes) {
    return NextResponse.json(
      { error: `File too large. Max size is ${EVIDENCE_UPLOAD_LIMITS.maxSizeBytes / (1024 * 1024)}MB.` },
      { status: 400 }
    );
  }
  if (!EVIDENCE_UPLOAD_LIMITS.allowedMimeTypes.includes(file.type as (typeof EVIDENCE_UPLOAD_LIMITS.allowedMimeTypes)[number])) {
    return NextResponse.json(
      { error: `Unsupported file type "${file.type}". Allowed: ${EVIDENCE_UPLOAD_LIMITS.allowedMimeTypes.join(", ")}.` },
      { status: 400 }
    );
  }

  // 2. The uploading wallet must actually be a participant in this trade —
  // this is what stops a random wallet from attaching evidence to a trade
  // it has nothing to do with.
  const participant = await isTradeParticipant(tradeId, wallet);
  if (!participant) {
    return NextResponse.json(
      { error: "Wallet is not a participant in this trade" },
      { status: 403 }
    );
  }

  // 3. Participation verified — perform the upload. No signature needed:
  // this is an off-chain write, and participant-gating is the access
  // control, not proof of wallet ownership.
  const result = await uploadEvidence({ walletAddress: wallet, tradeId, file });

  if (!result) {
    return NextResponse.json(
      { error: "Upload failed. Supabase may be unavailable — try again shortly." },
      { status: 500 }
    );
  }

  return NextResponse.json(result);
}
