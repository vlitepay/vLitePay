"use client";

import { notify } from "@/lib/notify";

/**
 * Native share sheet when available, falling back to copying a plain-text
 * summary to the clipboard. Used by every receipt card (Send, Swap,
 * Top Up, CCTP) so "Share" behaves identically everywhere.
 */
export async function shareReceipt(payload: { title: string; text: string; url?: string }): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(payload);
      return;
    } catch {
      // User cancelled the native share sheet — fall through to copy.
    }
  }
  if (typeof navigator !== "undefined" && navigator.clipboard) {
    const text = [payload.title, payload.text, payload.url].filter(Boolean).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      notify({ category: "system", title: "Copied", message: "Receipt details copied to clipboard." });
    } catch {
      // Clipboard can legitimately be unavailable (permissions) — silent no-op is acceptable here.
    }
  }
}
