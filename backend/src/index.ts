import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import path from "path";
import { reloadlyRouter, reloadlyWebhookRouter } from "./routes/reloadly.js";
import { uploadRouter } from "./routes/upload.js";
import { notificationsRouter } from "./routes/notifications.js";
import { receiptsRouter } from "./routes/receipts.js";

const app = express();

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: process.env.CORS_ORIGIN || "*" }));
app.use(express.json());

// Serve uploaded files (payment proofs, avatars) statically for local dev.
// Swap for an IPFS gateway URL in production — see routes/upload.ts.
app.use("/uploads", express.static(path.resolve(process.env.UPLOAD_DIR || "./uploads")));

app.get("/health", (_req, res) => res.json({ ok: true, service: "vlitepay-backend" }));

app.use("/airtime", reloadlyRouter);
app.use("/webhooks/reloadly", reloadlyWebhookRouter);
app.use("/uploads", uploadRouter);
app.use("/notifications", notificationsRouter);
app.use("/receipts", receiptsRouter);

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`vLitePay backend listening on :${port}`);
});
