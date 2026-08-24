import "server-only";
import { getProfileByWallet } from "@/lib/supabase-profile";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

export interface SendUserNotificationParams {
  wallet: string;
  category: string; // e.g. "dispute_resolved", "merchant_approved", "merchant_rejected"
  title: string;
  message: string;
}

/**
 * SERVER-ONLY foundation for sending a transactional notification to a
 * wallet's owner, e.g. from a future admin action (dispute resolved,
 * merchant approved/rejected).
 *
 * NOT WIRED INTO ANY REAL TRIGGER YET — this step only lays the
 * foundation (per its explicit scope). The natural next step is calling
 * this from wherever those admin actions already live (e.g.
 * app/admin/disputes, app/admin/merchants) once that wiring is wanted.
 *
 * Deliberately thin: looks up the wallet's email (gracefully no-ops if
 * absent — a wallet with no email on file, e.g. most Google logins or
 * anyone who connected a raw wallet without ever using Circle email/Google,
 * simply can't be emailed yet, which is expected, not an error) and posts
 * to the backend's existing `/notifications/email` stub
 * (backend/src/routes/notifications.ts) — that route already handles
 * "no email provider configured" gracefully on its own (logs + returns
 * `{ sent: false, stub: true }` rather than failing), so this function
 * doesn't need to duplicate that check.
 *
 * Per this step's explicit scope, this does NOT touch which email provider
 * is configured (Mailtrap/Zoho/Resend/etc.) — that's a separate, later
 * decision; this only wires the app/data path up to whatever the backend
 * already does with a notification request.
 *
 * Returns `true` only if the backend confirms it actually sent (or would
 * send, per its own stub semantics) — `false` for every other case
 * (no email on file, backend unreachable, backend rejected the request).
 * Never throws.
 */
export async function sendUserNotification({
  wallet,
  category,
  title,
  message,
}: SendUserNotificationParams): Promise<boolean> {
  const profile = await getProfileByWallet(wallet);

  if (!profile?.email) {
    console.log(`[notifications] skipped — no email on file for ${wallet}`);
    return false;
  }

  try {
    const res = await fetch(`${BACKEND_URL}/notifications/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to: profile.email, category, title, message }),
    });

    const body = await res.json().catch(() => ({}));
    return res.ok && body?.sent === true;
  } catch (err) {
    console.warn("[notifications] request failed:", err instanceof Error ? err.message : err);
    return false;
  }
}
