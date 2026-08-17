import { signMessage } from "wagmi/actions";
import { wagmiConfig } from "@/lib/wagmi-config";

/**
 * Client-side wrapper for the secure evidence upload flow: GET
 * /api/evidence/nonce -> wallet signs the returned message -> POST
 * /api/evidence/upload with { wallet, message, signature, file }.
 *
 * Mirrors useProfileStore.saveToSupabase's shape deliberately (same
 * result-object-not-throw pattern, same wagmi/actions signMessage usage —
 * works identically whether the connected wallet is injected/WalletConnect
 * or the Circle email connector) so callers handle both the same way.
 *
 * Never throws: a rejected signature, expired/invalid nonce, or network
 * failure all resolve to `{ ok: false, error }` rather than an exception.
 */
export type UploadEvidenceClientResult =
  | { ok: true; path: string; signedUrl: string }
  | { ok: false; error: string };

export async function uploadEvidenceClient(
  walletAddress: string,
  file: File
): Promise<UploadEvidenceClientResult> {
  try {
    const key = walletAddress.toLowerCase();

    // 1. Get a fresh, single-use nonce/message for this wallet.
    const nonceRes = await fetch(`/api/evidence/nonce?wallet=${encodeURIComponent(key)}`);
    if (!nonceRes.ok) {
      return { ok: false, error: "Could not start a secure upload — please try again." };
    }
    const nonceJson = await nonceRes.json().catch(() => null);
    const message = nonceJson?.message;
    if (typeof message !== "string" || !message) {
      return { ok: false, error: "Could not start a secure upload — please try again." };
    }

    // 2. Ask the connected wallet to sign that exact message.
    const signature = await signMessage(wagmiConfig, { account: walletAddress as `0x${string}`, message });

    // 3. Submit wallet + message + signature + the file. The route
    // re-verifies everything server-side before uploading.
    const formData = new FormData();
    formData.append("wallet", key);
    formData.append("message", message);
    formData.append("signature", signature);
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
    // Covers: signature rejected by the user, wallet/Circle prompt errored,
    // or a network failure at any step.
    const message = err instanceof Error ? err.message : "Upload failed.";
    return { ok: false, error: message };
  }
}
