"use client";

import { useState } from "react";
import { ScanEye, AlertTriangle, CheckCircle2, Upload } from "lucide-react";
import clsx from "clsx";

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000";

interface AnalysisResult {
  confidence: number; // 0-100
  merchant: string | null;
  date: string | null;
  total: string | null;
  currency: string | null;
  items: string[];
  flags: string[];
}

/**
 * Sends the uploaded image to the backend's /receipts/analyze endpoint,
 * which runs it through Google Cloud Vision OCR (free tier) and
 * heuristically extracts merchant/date/total/currency/items from the
 * recognized text — see backend/src/routes/receipts.ts.
 */
async function analyzeReceipt(file: File): Promise<AnalysisResult> {
  const formData = new FormData();
  formData.append("image", file);

  const res = await fetch(`${BACKEND_URL}/receipts/analyze`, {
    method: "POST",
    body: formData,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error || "Receipt analysis failed");
  }

  return res.json();
}

export function ReceiptAnalyzer() {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setResult(null);
    setError(null);
    setPreview(URL.createObjectURL(f));
  }

  async function runAnalysis() {
    if (!file) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await analyzeReceipt(file);
      setResult(res);
    } catch (err: any) {
      setError(err?.message || "Receipt analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="glass-panel p-4 space-y-3">
      <h4 className="text-sm font-semibold flex items-center gap-1.5">
        <ScanEye size={15} className="text-vlite-cyan" /> AI receipt analysis
      </h4>
      <p className="text-[11px] text-ink-muted">Powered by Google Cloud Vision OCR — extracts merchant, date, total, currency, and line items.</p>

      <label className="glass-panel-flush rounded-xl p-3 flex items-center gap-2 text-sm cursor-pointer hover:bg-white/60 dark:hover:bg-white/10 transition">
        <Upload size={15} className="text-ink-muted" />
        {file ? file.name : "Upload payment proof / receipt image"}
        <input type="file" accept="image/*" className="hidden" onChange={handleFile} />
      </label>

      {preview && (
        <img src={preview} alt="Receipt preview" className="rounded-xl max-h-40 w-full object-cover border border-white/20" />
      )}

      <button onClick={runAnalysis} disabled={!file || analyzing} className="btn-vlite-secondary w-full !py-2 text-sm">
        {analyzing ? "Analyzing…" : "Run analysis"}
      </button>

      {error && (
        <p className="flex items-center gap-1.5 text-danger text-xs">
          <AlertTriangle size={13} className="shrink-0" /> {error}
        </p>
      )}

      {result && (
        <div className="rounded-2xl bg-white/40 dark:bg-white/5 p-3 space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">OCR confidence</span>
            <span
              className={clsx(
                "stat-mono font-semibold",
                result.confidence > 75 ? "text-success" : result.confidence > 55 ? "text-warning" : "text-danger"
              )}
            >
              {result.confidence}%
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">Merchant</span>
            <span className="stat-mono truncate max-w-[60%] text-right">{result.merchant ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">Date</span>
            <span className="stat-mono">{result.date ?? "—"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-ink-muted">Total</span>
            <span className="stat-mono">
              {result.total ? `${result.currency ? result.currency + " " : ""}${result.total}` : "—"}
            </span>
          </div>

          {result.items.length > 0 && (
            <div className="pt-1 border-t border-white/15 dark:border-white/5">
              <p className="text-xs text-ink-muted mb-1">Line items</p>
              <ul className="space-y-0.5">
                {result.items.map((item, i) => (
                  <li key={i} className="stat-mono text-xs truncate">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-1 border-t border-white/15 dark:border-white/5">
            {result.flags.length === 0 ? (
              <p className="flex items-center gap-1.5 text-success text-xs">
                <CheckCircle2 size={13} /> No anomalies detected
              </p>
            ) : (
              result.flags.map((f) => (
                <p key={f} className="flex items-center gap-1.5 text-warning text-xs mt-1">
                  <AlertTriangle size={13} className="shrink-0" /> {f}
                </p>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
