import axios from "axios";

export interface VisionOcrResult {
  rawText: string;
  /** Page-level OCR confidence from Vision, 0-1. Falls back to a rough estimate if Vision doesn't return one. */
  confidence: number;
}

/**
 * Calls Google Cloud Vision's `images:annotate` REST endpoint directly with
 * an API key — the simplest way to use Vision's free tier (no service
 * account JSON, no @google-cloud/vision SDK dependency). Enable the Cloud
 * Vision API on a Google Cloud project, create an API key restricted to
 * that API, and drop it into GOOGLE_CLOUD_VISION_API_KEY.
 *
 * Uses DOCUMENT_TEXT_DETECTION (rather than plain TEXT_DETECTION) since
 * it's tuned for dense printed text like receipts and also returns a
 * page-level confidence score we use directly instead of guessing one.
 *
 * Docs: https://cloud.google.com/vision/docs/ocr
 */
export async function runReceiptOcr(base64Image: string): Promise<VisionOcrResult> {
  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_CLOUD_VISION_API_KEY is not configured");
  }

  const { data } = await axios.post(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
    requests: [
      {
        image: { content: base64Image },
        features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
      },
    ],
  });

  const response = data?.responses?.[0];
  if (response?.error) {
    throw new Error(response.error.message || "Vision API returned an error");
  }

  const rawText: string = response?.fullTextAnnotation?.text || "";
  const pageConfidence: number | undefined = response?.fullTextAnnotation?.pages?.[0]?.confidence;

  return {
    rawText,
    confidence: typeof pageConfidence === "number" ? pageConfidence : rawText ? 0.75 : 0,
  };
}
