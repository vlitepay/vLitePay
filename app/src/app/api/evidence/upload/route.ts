import { NextRequest, NextResponse } from "next/server";
import { consumeEvidenceNonce } from "@/lib/evidence-nonce";
import { verifyWalletSignature } from "@/lib/verify-wallet-signature";
import { uploadEvidence } from "@/lib/supabase-evidence-upload";
import { EVIDENCE_UPLOAD_LIMITS } from "@/lib/constants";

/**
 * POST /api/evidence/upload
 * Body: multipart/form-data with fields:
 *   wallet: string
 *   message: string    // the exact string returned by GET /api/evidence/nonce
 *   signature: string
 *   file: File
 *
 * SECURITY ORDER — mirrors POST /api/profile, do not reorder or skip:
 *   1. Validate required fields (400 if missing) and the file itself
 *      (size/type against EVIDENCE_UPLOAD_LIMITS — a clearer 400 than
 *      letting Supabase Storage's own bucket-level limit reject it).
 *   2. consumeEvidenceNonce(wallet, message) — confirms `message` is the
 *      current, unexpired, single-use nonce for `wallet` and invalidates
 *      it immediately, before the signature is even looked at.
 *   3. verifyWalletSignature({ wallet, message, signature }) — confirms
 *      `signature` genuinely came from `wallet` (EIP-1271 aware, so this
 *      works for Circle's smart-contract wallets too).
 *   4. Only after both pass: uploadEvidence() — service-role write to the
 *      private `evidence` bucket, path scoped under the wallet address.
 *
 * NOT wired into any dispute/chat UI yet — this is foundation only, same
 * scope as POST /api/profile was before ActiveTradeBanner/TradeChat used
 * anything from it.
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: "Invalid or missing form data" }, { status: 400 });
  }

  const wallet = formData.get("wallet");
  const message = formData.get("message");
  const signature = formData.get("signature");
  const file = formData.get("file");

  // 1a. Required fields present and the right types.
  if (
    typeof wallet !== "string" ||
    !wallet ||
    typeof message !== "string" ||
    !message ||
    typeof signature !== "string" ||
    !signature ||
    !(file instanceof File)
  ) {
    return NextResponse.json(
      { error: "Missing required `wallet`, `message`, `signature`, or `file` field" },
      { status: 400 }
    );
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

  // 2. Nonce must be valid, unexpired, and not already consumed.
  const nonceValid = consumeEvidenceNonce(wallet, message);
  if (!nonceValid) {
    return NextResponse.json(
      { error: "Invalid, expired, or already-used nonce. Request a new one from GET /api/evidence/nonce." },
      { status: 401 }
    );
  }

  // 3. Signature must genuinely be `wallet` signing exactly `message`.
  const { valid, error: verifyError } = await verifyWalletSignature({ wallet, message, signature });
  if (!valid) {
    return NextResponse.json(
      { error: "Signature verification failed", detail: verifyError },
      { status: 401 }
    );
  }

  // 4. Ownership verified — perform the upload.
  const result = await uploadEvidence({ walletAddress: wallet, file });

  if (!result) {
    return NextResponse.json(
      { error: "Upload failed. Supabase may be unavailable — try again shortly." },
      { status: 500 }
    );
  }

  return NextResponse.json(result);
}
