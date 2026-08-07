import { Router } from "express";
import multer from "multer";
import { runReceiptOcr } from "../services/visionClient.js";
import { parseReceiptText } from "../lib/receiptParser.js";

export const receiptsRouter = Router();

// Memory storage — the image is only needed transiently to forward to
// Vision; nothing is written to disk here (unlike routes/upload.ts, which
// persists payment-proof uploads for the dispute record itself).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) return cb(new Error("Only image uploads are allowed"));
    cb(null, true);
  },
});

/**
 * POST /receipts/analyze (multipart/form-data, field name "image")
 *
 * Runs the uploaded receipt/payment-proof image through Google Cloud
 * Vision's OCR (DOCUMENT_TEXT_DETECTION, free tier), then heuristically
 * extracts merchant/date/total/currency/items from the recognized text.
 * Backs components/admin/ReceiptAnalyzer.tsx in the dispute-review UI.
 */
receiptsRouter.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "image file is required (field name 'image')" });
    }

    if (!process.env.GOOGLE_CLOUD_VISION_API_KEY) {
      return res.status(501).json({
        error: "Google Cloud Vision isn't configured on this environment yet — set GOOGLE_CLOUD_VISION_API_KEY.",
      });
    }

    const base64Image = req.file.buffer.toString("base64");
    const { rawText, confidence } = await runReceiptOcr(base64Image);

    if (!rawText) {
      return res.json({
        confidence: 0,
        merchant: null,
        date: null,
        total: null,
        currency: null,
        items: [],
        flags: ["No text could be detected on this image — try a clearer, well-lit photo"],
      });
    }

    const parsed = parseReceiptText(rawText);

    res.json({
      confidence: Math.round(confidence * 100),
      ...parsed,
    });
  } catch (err: any) {
    res.status(502).json({ error: "Receipt analysis failed", detail: err?.response?.data ?? err.message });
  }
});
