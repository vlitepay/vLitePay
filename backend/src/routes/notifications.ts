import { Router } from "express";

export const notificationsRouter = Router();

/**
 * POST /notifications/email
 * Body: { to: string, category: string, title: string, message: string }
 *
 * Placeholder endpoint — wires up the shape a real email provider integration
 * needs, without actually sending anything yet. To make this real:
 *
 *   Resend:
 *     import { Resend } from "resend";
 *     const resend = new Resend(process.env.RESEND_API_KEY);
 *     await resend.emails.send({ from: EMAIL_FROM, to, subject: title, html: renderTemplate(...) });
 *
 *   SendGrid:
 *     import sgMail from "@sendgrid/mail";
 *     sgMail.setApiKey(process.env.SENDGRID_API_KEY!);
 *     await sgMail.send({ from: EMAIL_FROM, to, subject: title, html: renderTemplate(...) });
 *
 * Either way, this route's request/response contract stays the same, so the
 * frontend/backend boundary doesn't need to change when a real provider is
 * wired in — only the body of the try block below does.
 */
notificationsRouter.post("/email", async (req, res) => {
  const { to, category, title, message } = req.body ?? {};

  if (!to || !title || !message) {
    return res.status(400).json({ error: "to, title, and message are required" });
  }

  const provider = process.env.EMAIL_PROVIDER; // "resend" | "sendgrid" | undefined

  if (!provider || (!process.env.RESEND_API_KEY && !process.env.SENDGRID_API_KEY)) {
    console.log(`[email notification stub] would send to ${to}: [${category}] ${title} — ${message}`);
    return res.json({ sent: false, stub: true, reason: "No email provider configured (EMAIL_PROVIDER / API key unset)" });
  }

  try {
    // TODO: replace with a real Resend/SendGrid call once an API key is set —
    // see the doc comment above for the exact snippet to drop in here.
    console.log(`[email notification] provider=${provider} to=${to} title="${title}"`);
    res.json({ sent: true, provider });
  } catch (err: any) {
    res.status(502).json({ error: "Failed to send email", detail: err?.message });
  }
});
