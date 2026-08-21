"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertOctagon, Paperclip, X, FileCheck2, Loader2 } from "lucide-react";
import { useAccount } from "wagmi";
import { useEscrowActions } from "@/hooks/useEscrowActions";
import { uploadEvidenceClient } from "@/lib/uploadEvidenceClient";
import { notify } from "@/lib/notify";

export function DisputeModal({ tradeId, onResolved }: { tradeId: bigint; onResolved?: () => void }) {
  const { address } = useAccount();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { raiseDispute, busy, error } = useEscrowActions();

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    e.target.value = "";
    if (!selected) return;
    setFile(selected);
    setUploadStatus("idle");
    setUploadError(null);
  }

  async function handleSubmit() {
    if (!reason.trim()) return;

    // If evidence is attached, upload it FIRST (no wallet signature — this
    // is an off-chain Supabase Storage write, gated by an on-chain
    // participant check server-side, not a signature; see
    // app/api/evidence/upload/route.ts) and only proceed to raiseDispute
    // once that succeeds — a dispute shouldn't claim evidence that never
    // actually made it to storage. `evidenceURI` on-chain is a plain
    // string (see useEscrowActions.raiseDispute), so no contract change is
    // needed: the signed URL is appended to the reason text rather than
    // replacing it, staying backward-compatible with how arbiters already
    // read this field in DisputeCard.tsx.
    //
    // raiseDispute() below is the ONLY step in this whole flow that
    // prompts a wallet confirmation — it's a real on-chain transaction.
    // The evidence upload above never does.
    let evidenceURI = reason.trim();

    if (file) {
      if (!address) {
        setUploadStatus("error");
        setUploadError("No wallet connected.");
        return;
      }
      setUploadStatus("uploading");
      setUploadError(null);
      const result = await uploadEvidenceClient(address, Number(tradeId), file);
      if (!result.ok) {
        setUploadStatus("error");
        setUploadError(result.error);
        return;
      }
      setUploadStatus("idle");
      evidenceURI = `${reason.trim()}\n\nEvidence: ${result.signedUrl}`;
    }

    const hash = await raiseDispute(tradeId, evidenceURI);
    if (hash) {
      setOpen(false);
      setFile(null);
      notify({
        category: "p2p_trade",
        title: `Dispute raised — trade #${tradeId}`,
        message: "Funds stay locked in escrow until an arbiter reviews and resolves this trade.",
        href: `/p2p/trade/${tradeId}`,
      });
      onResolved?.();
    }
  }

  const isBusy = busy || uploadStatus === "uploading";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-2xl py-3 text-sm font-semibold text-danger border border-danger/30 hover:bg-danger/10 transition flex items-center justify-center gap-2"
      >
        <AlertOctagon size={15} />
        Raise a dispute
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-end md:items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 40 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-panel w-full max-w-sm p-5"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold flex items-center gap-2">
                  <AlertOctagon size={16} className="text-danger" /> Raise a dispute
                </h3>
                <button onClick={() => setOpen(false)} className="btn-vlite-icon h-8 w-8">
                  <X size={14} />
                </button>
              </div>

              <p className="text-xs text-ink-muted mb-3">
                An arbiter will review this trade's chat, payment proof, and your description below. Funds stay locked
                in escrow until resolved.
              </p>

              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={4}
                placeholder="Describe what went wrong (e.g. fiat sent but seller hasn't released)…"
                className="w-full rounded-xl px-3 py-2.5 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-danger resize-none"
              />

              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,application/pdf"
                className="hidden"
                onChange={handleFileSelect}
              />

              {file ? (
                <div className="flex items-center justify-between mt-2 rounded-xl px-3 py-2 bg-white/40 dark:bg-white/5 border border-white/30 dark:border-white/10">
                  <span className="flex items-center gap-1.5 text-xs font-medium truncate">
                    <FileCheck2 size={13} className="text-emerald-500 shrink-0" />
                    <span className="truncate">{file.name}</span>
                  </span>
                  <button
                    onClick={() => {
                      setFile(null);
                      setUploadStatus("idle");
                      setUploadError(null);
                    }}
                    aria-label="Remove attachment"
                    className="shrink-0"
                  >
                    <X size={13} className="text-ink-muted" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full mt-2 flex items-center justify-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink-light dark:hover:text-ink-dark py-1.5"
                >
                  <Paperclip size={13} />
                  Attach evidence (optional)
                </button>
              )}

              {uploadStatus === "error" && uploadError && <p className="text-xs text-danger mt-2">{uploadError}</p>}
              {error && <p className="text-xs text-danger mt-2">{error}</p>}

              <button
                onClick={handleSubmit}
                disabled={isBusy || !reason.trim()}
                className="w-full mt-3 rounded-2xl py-3 text-sm font-semibold bg-danger text-white disabled:opacity-50 active:scale-[0.97] transition-transform flex items-center justify-center gap-1.5"
              >
                {uploadStatus === "uploading" ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Uploading evidence…
                  </>
                ) : busy ? (
                  "Submitting…"
                ) : (
                  "Submit dispute"
                )}
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
