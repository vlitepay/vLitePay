"use client";

import { useEffect, useMemo, useState } from "react";
import { isAddress } from "viem";
import { CheckCircle2, XCircle } from "lucide-react";
import clsx from "clsx";
import { useResolveUsername } from "@/hooks/useUsernameRegistry";
import { QrScannerModal } from "./QrScannerModal";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export function RecipientInput({
  value,
  onChange,
  onResolvedAddress,
}: {
  value: string;
  onChange: (v: string) => void;
  onResolvedAddress: (addr: `0x${string}` | null) => void;
}) {
  const [mode, setMode] = useState<"username" | "address">("username");

  const looksLikeUsername = mode === "username" && value.length >= 3 && !value.startsWith("0x");
  const { data: resolved } = useResolveUsername(looksLikeUsername ? value : "");

  const resolvedAddress: `0x${string}` | null = useMemo(() => {
    if (mode === "address") {
      return isAddress(value) ? (value as `0x${string}`) : null;
    }
    if (resolved && resolved !== ZERO_ADDRESS) return resolved as `0x${string}`;
    return null;
  }, [mode, value, resolved]);

  useEffect(() => {
    onResolvedAddress(resolvedAddress);
  }, [resolvedAddress, onResolvedAddress]);

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-ink-muted">Send to</label>
        <div className="flex gap-1 text-xs">
          <button
            onClick={() => setMode("username")}
            className={clsx("px-2 py-0.5 rounded-full", mode === "username" ? "bg-vlite-gradient text-white" : "text-ink-muted")}
          >
            Username
          </button>
          <button
            onClick={() => setMode("address")}
            className={clsx("px-2 py-0.5 rounded-full", mode === "address" ? "bg-vlite-gradient text-white" : "text-ink-muted")}
          >
            Address
          </button>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          value={value}
          onChange={(e) => onChange(mode === "username" ? e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") : e.target.value)}
          placeholder={mode === "username" ? "username" : "0x…"}
          className="flex-1 stat-mono rounded-xl px-3 py-2.5 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
        />
        <QrScannerModal onScan={(v) => { setMode("address"); onChange(v); }} />
      </div>

      {value.length >= 3 && (
        <p className={clsx("text-xs mt-1.5 flex items-center gap-1", resolvedAddress ? "text-success" : "text-danger")}>
          {resolvedAddress ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
          {resolvedAddress ? `Resolved: ${resolvedAddress.slice(0, 6)}…${resolvedAddress.slice(-4)}` : "Not found"}
        </p>
      )}
    </div>
  );
}
