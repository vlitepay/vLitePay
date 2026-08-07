"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserQRCodeReader } from "@zxing/browser";
import { AnimatePresence, motion } from "framer-motion";
import { X, QrCode } from "lucide-react";

export function QrScannerModal({ onScan }: { onScan: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    if (!open) return;
    const reader = new BrowserQRCodeReader();
    let cancelled = false;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result, err, controls) => {
        controlsRef.current = controls;
        if (result && !cancelled) {
          onScan(result.getText());
          controls.stop();
          setOpen(false);
        }
      })
      .catch(() => setError("Couldn't access the camera — check browser permissions."));

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
    };
  }, [open, onScan]);

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-vlite-icon" aria-label="Scan QR code">
        <QrCode size={16} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-panel w-full max-w-sm p-4 relative"
            >
              <button onClick={() => setOpen(false)} className="btn-vlite-icon h-8 w-8 absolute top-3 right-3 z-10">
                <X size={14} />
              </button>
              <p className="text-sm font-medium mb-3">Scan a vLitePay QR code</p>
              {error ? (
                <p className="text-sm text-danger py-8 text-center">{error}</p>
              ) : (
                <video ref={videoRef} className="w-full rounded-2xl aspect-square object-cover bg-black" muted playsInline />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
