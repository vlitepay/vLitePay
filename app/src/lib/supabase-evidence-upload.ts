import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase-admin";
import { STORAGE_BUCKETS } from "@/lib/constants";

/**
 * SERVER-ONLY evidence upload helper. Uploads to the private `evidence`
 * bucket using the service-role client (required — that bucket has no
 * anon/authenticated read or write policy at all, by design, see the
 * storage SQL migration) and returns a short-lived signed URL, since a
 * private bucket has no public URL.
 *
 * Callers MUST have already verified wallet ownership (nonce + signature —
 * see lib/evidence-nonce.ts and lib/verify-wallet-signature.ts) before
 * calling this. This function itself does not check ownership; it trusts
 * `walletAddress` completely, same trust boundary as
 * lib/supabase-profile-write.ts's upsertProfile().
 *
 * Not wired into any dispute/chat UI yet — this is foundation only, called
 * so far only by app/api/evidence/upload/route.ts.
 */

const SIGNED_URL_EXPIRY_SECONDS = 60 * 60; // 1 hour — enough to view/attach right after upload

export interface UploadEvidenceParams {
  walletAddress: string;
  file: File;
}

export interface UploadEvidenceResult {
  path: string;
  signedUrl: string;
  expiresAt: string;
}

function sanitizeFileName(name: string): string {
  // Keep it simple and predictable in the storage path — strip anything
  // that isn't alphanumeric/dot/dash/underscore, cap length.
  const cleaned = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  return cleaned || "file";
}

/**
 * Uploads `file` to `evidence/<wallet>/<uuid>-<filename>` and returns a
 * signed URL valid for SIGNED_URL_EXPIRY_SECONDS. Returns `null` on any
 * failure (Supabase unconfigured, upload error, signing error) — never
 * throws, so a route calling this doesn't need its own try/catch just for
 * this call.
 */
export async function uploadEvidence({
  walletAddress,
  file,
}: UploadEvidenceParams): Promise<UploadEvidenceResult | null> {
  const admin = getSupabaseAdmin();
  if (!admin || !walletAddress || !file) return null;

  const key = walletAddress.toLowerCase();
  const path = `${key}/${crypto.randomUUID()}-${sanitizeFileName(file.name)}`;

  const arrayBuffer = await file.arrayBuffer().catch(() => null);
  if (!arrayBuffer) return null;

  const { error: uploadError } = await admin.storage
    .from(STORAGE_BUCKETS.evidence)
    .upload(path, arrayBuffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    console.warn("[supabase-evidence-upload] upload failed:", uploadError.message);
    return null;
  }

  const { data: signedData, error: signError } = await admin.storage
    .from(STORAGE_BUCKETS.evidence)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);

  if (signError || !signedData?.signedUrl) {
    console.warn("[supabase-evidence-upload] createSignedUrl failed:", signError?.message);
    return null;
  }

  return {
    path,
    signedUrl: signedData.signedUrl,
    expiresAt: new Date(Date.now() + SIGNED_URL_EXPIRY_SECONDS * 1000).toISOString(),
  };
}
