/**
 * Client-side wrapper for evidence upload — a single POST, no wallet
 * signature required. Evidence upload is an off-chain action (Supabase
 * Storage write only, no contract call), so per product decision it
 * doesn't prompt a signature; the server gates access with an on-chain
 * participant check instead (see app/api/evidence/upload/route.ts).
 *
 * Never throws: a non-participant wallet, validation error, or network
 * failure all resolve to `{ ok: false, error }`.
 */
export type UploadEvidenceClientResult =
  | { ok: true; path: string; signedUrl: string }
  | { ok: false; error: string };

export async function uploadEvidenceClient(
  walletAddress: string,
  tradeId: number,
  file: File
): Promise<UploadEvidenceClientResult> {
  try {
    const formData = new FormData();
    formData.append("wallet", walletAddress.toLowerCase());
    formData.append("tradeId", String(tradeId));
    formData.append("file", file);

    const uploadRes = await fetch("/api/evidence/upload", { method: "POST", body: formData });

    if (!uploadRes.ok) {
      const errJson = await uploadRes.json().catch(() => null);
      return {
        ok: false,
        error: typeof errJson?.error === "string" ? errJson.error : `Upload failed (${uploadRes.status}).`,
      };
    }

    const json = await uploadRes.json();
    if (typeof json?.path !== "string" || typeof json?.signedUrl !== "string") {
      return { ok: false, error: "Upload succeeded but the response was malformed." };
    }

    return { ok: true, path: json.path, signedUrl: json.signedUrl };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed.";
    return { ok: false, error: message };
  }
}
