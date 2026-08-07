import { Router } from "express";
import crypto from "crypto";
import { reloadlyRequest } from "../services/reloadlyClient.js";
import { verifyTopupPayment, TopupVerificationError } from "../lib/chain.js";
import { claimTxHash, redeemTxHash, releaseTxHash } from "../lib/topupGuard.js";

export const reloadlyRouter = Router();

/**
 * GET /airtime/operators?countryCode=NG — lists available operators for a country.
 * Passes includeData/includeBundles so data-bundle SKUs (e.g. "MTN Nigeria Data")
 * are returned alongside plain airtime operators — the frontend's Airtime/Data
 * toggle filters on each operator's `data` flag from this same response.
 */
reloadlyRouter.get("/operators", async (req, res) => {
  try {
    const { countryCode } = req.query;
    if (!countryCode) return res.status(400).json({ error: "countryCode is required" });

    const operators = await reloadlyRequest(
      "get",
      `/operators/countries/${countryCode}?includeData=true&includeBundles=true&includeCombo=true&suggestedAmountsMap=true`
    );
    res.json(operators);
  } catch (err: any) {
    res.status(502).json({ error: "Failed to fetch operators", detail: err?.response?.data ?? err.message });
  }
});

/** GET /airtime/operators/:id — refreshes a single operator's live pricing/limits before purchase. */
reloadlyRouter.get("/operators/:id", async (req, res) => {
  try {
    const operator = await reloadlyRequest("get", `/operators/${req.params.id}`);
    res.json(operator);
  } catch (err: any) {
    res.status(502).json({ error: "Failed to fetch operator", detail: err?.response?.data ?? err.message });
  }
});

/** GET /airtime/detect?phone=+2348012345678 — auto-detects the operator for a phone number. */
reloadlyRouter.get("/detect", async (req, res) => {
  try {
    const { phone, countryCode } = req.query;
    if (!phone || !countryCode) return res.status(400).json({ error: "phone and countryCode are required" });

    const operator = await reloadlyRequest("get", `/operators/auto-detect/phone/${phone}/countries/${countryCode}`);
    res.json(operator);
  } catch (err: any) {
    res.status(502).json({ error: "Failed to detect operator", detail: err?.response?.data ?? err.message });
  }
});

/**
 * POST /airtime/topup
 * Body: { operatorId, amount, recipientPhone, recipientCountryCode,
 *         tokenSymbol, tokenAmount, vlitePayTxHash }
 *
 * The dedicated, single-transaction top-up flow: the frontend sends ONE
 * ERC20 transfer of (top-up amount + fee) directly to the treasury address
 * — no approve/transferFrom two-step, no separate fee transaction. This
 * endpoint is the only thing standing between that claim and Reloadly
 * actually being called:
 *
 *   1. Verify `vlitePayTxHash` on-chain via viem — confirmed, successful,
 *      the right token, transferred to the live treasury address, for at
 *      least `tokenAmount`.
 *   2. Reject if that tx hash has already been redeemed for a previous
 *      top-up (replay protection).
 *   3. Only then call Reloadly, using the account's existing prepaid
 *      balance — both the top-up amount and the fee stay in the treasury;
 *      Reloadly is paid out of the separate prepaid Reloadly account, not
 *      from this transaction.
 */
reloadlyRouter.post("/topup", async (req, res) => {
  try {
    const { operatorId, amount, recipientPhone, recipientCountryCode, tokenSymbol, tokenAmount, vlitePayTxHash } = req.body;

    if (!operatorId || !amount || !recipientPhone || !recipientCountryCode) {
      return res.status(400).json({ error: "operatorId, amount, recipientPhone, recipientCountryCode are required" });
    }
    if (!tokenSymbol || !tokenAmount || !vlitePayTxHash) {
      return res.status(400).json({ error: "tokenSymbol, tokenAmount, and vlitePayTxHash are required" });
    }

    try {
      await verifyTopupPayment({ txHash: vlitePayTxHash, tokenSymbol, tokenAmount });
    } catch (err: any) {
      const message = err instanceof TopupVerificationError ? err.message : "Could not verify payment on-chain";
      return res.status(402).json({ error: message });
    }

    // Reserve the hash right after verification, before calling Reloadly —
    // this is what actually prevents a concurrent/retried request from
    // double-spending the same payment.
    if (!claimTxHash(vlitePayTxHash)) {
      return res.status(409).json({ error: "This payment has already been used for a top-up" });
    }

    try {
      const result = await reloadlyRequest("post", "/topups", {
        operatorId,
        amount,
        useLocalAmount: false,
        recipientPhone: { countryCode: recipientCountryCode, number: recipientPhone },
        senderPhone: { countryCode: recipientCountryCode, number: recipientPhone },
      });

      redeemTxHash(vlitePayTxHash);
      res.json(result);
    } catch (err: any) {
      // Reloadly failed after a verified payment — release the claim so the
      // same (already-paid) transaction can be retried instead of being
      // permanently stuck.
      releaseTxHash(vlitePayTxHash);
      throw err;
    }
  } catch (err: any) {
    res.status(502).json({ error: "Topup failed", detail: err?.response?.data ?? err.message });
  }
});

/**
 * Mounted separately at POST /webhooks/reloadly (see index.ts) — Reloadly
 * calls this when a topup's status changes (SUCCESSFUL / FAILED / REFUNDED).
 * Verifies the shared-secret signature header before trusting the payload.
 */
export const reloadlyWebhookRouter = Router();

reloadlyWebhookRouter.post("/", (req, res) => {
  const signature = req.header("x-reloadly-signature");
  const secret = process.env.RELOADLY_WEBHOOK_SECRET;

  if (secret) {
    const expected = crypto.createHmac("sha256", secret).update(JSON.stringify(req.body)).digest("hex");
    if (signature !== expected) {
      return res.status(401).json({ error: "Invalid webhook signature" });
    }
  }

  const { transactionId, status } = req.body ?? {};
  console.log(`[reloadly webhook] transaction ${transactionId} -> ${status}`);

  // TODO: look up the vLitePay user/trade associated with this transactionId
  // (e.g. via a DB keyed on the topup request) and push a notification /
  // update in-app status.

  res.status(200).json({ received: true });
});
