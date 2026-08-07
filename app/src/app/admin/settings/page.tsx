"use client";

import { useState } from "react";
import Link from "next/link";
import { isAddress } from "viem";
import { ArrowLeft } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { useAdminActions } from "@/hooks/useAdminActions";
import { useProtocolFee } from "@/hooks/useProtocolFee";
import { TOKENS, TokenSymbol, FIAT_CURRENCIES } from "@/lib/constants";
import { MerchantRecruitmentSettings } from "@/components/admin/MerchantRecruitmentSettings";
import { SupportConfigSettings } from "@/components/admin/SupportConfigSettings";

function FeeRow({
  label,
  currentBps,
  onSave,
  busy,
}: {
  label: string;
  currentBps?: number;
  onSave: (bps: bigint) => void;
  busy: boolean;
}) {
  const [value, setValue] = useState(currentBps != null ? String(currentBps / 100) : "");

  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="number"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-20 stat-mono rounded-xl px-2.5 py-1.5 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm text-right outline-none focus:ring-2 focus:ring-vlite-cyan"
        />
        <span className="text-xs text-ink-muted">%</span>
        <button
          onClick={() => onSave(BigInt(Math.round(Number(value) * 100)))}
          disabled={busy}
          className="text-xs font-semibold px-3 py-1.5 rounded-full bg-vlite-gradient text-white shadow-glow"
        >
          Save
        </button>
      </div>
    </div>
  );
}

export default function AdminSettingsPage() {
  const { makerFeeBps, takerFeeBps } = useProtocolFee();
  const { setMakerFee, setTakerFee, setSendFee, setAirtimeFee, setTimers, addArbiter, removeArbiter, setSupportedToken, setSupportedFiat, busy, error } =
    useAdminActions();

  const [defaultHours, setDefaultHours] = useState("24");
  const [altHours, setAltHours] = useState("48");
  const [arbiterAddr, setArbiterAddr] = useState("");
  const [tokenToggles, setTokenToggles] = useState<Record<TokenSymbol, boolean>>({ USDC: true, EURC: true, cirBTC: true });
  const [fiatToggles, setFiatToggles] = useState<Record<string, boolean>>(
    Object.fromEntries(FIAT_CURRENCIES.map((f) => [f.code, true]))
  );

  return (
    <AdminGate requireOwner>
      <div className="space-y-4 animate-slide-up pb-6">
        <Link href="/admin" className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-light dark:hover:text-ink-dark">
          <ArrowLeft size={15} /> Back to admin
        </Link>
        <h1 className="font-display text-xl font-semibold">Protocol Settings</h1>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="glass-panel p-4 space-y-3">
          <h3 className="font-semibold text-sm">Fees</h3>
          <FeeRow label="P2P maker fee (seller/depositor)" currentBps={makerFeeBps} onSave={setMakerFee} busy={busy} />
          <FeeRow label="P2P taker fee (buyer)" currentBps={takerFeeBps} onSave={setTakerFee} busy={busy} />
          <FeeRow label="Send/transfer fee" onSave={setSendFee} busy={busy} />
          <FeeRow label="Top Up fee" onSave={setAirtimeFee} busy={busy} />
        </div>

        <div className="glass-panel p-4 space-y-3">
          <h3 className="font-semibold text-sm">Escrow timers</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-ink-muted">Default window (hours)</label>
              <input
                type="number"
                value={defaultHours}
                onChange={(e) => setDefaultHours(e.target.value)}
                className="w-full mt-1 stat-mono rounded-xl px-3 py-2 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
              />
            </div>
            <div>
              <label className="text-xs text-ink-muted">Alternate window (hours)</label>
              <input
                type="number"
                value={altHours}
                onChange={(e) => setAltHours(e.target.value)}
                className="w-full mt-1 stat-mono rounded-xl px-3 py-2 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
              />
            </div>
          </div>
          <button
            onClick={() => setTimers(BigInt(Number(defaultHours) * 3600), BigInt(Number(altHours) * 3600))}
            disabled={busy}
            className="btn-vlite-secondary w-full !py-2 text-sm"
          >
            Save timers
          </button>
        </div>

        <div className="glass-panel p-4 space-y-3">
          <h3 className="font-semibold text-sm">Arbiters</h3>
          <div className="flex gap-2">
            <input
              value={arbiterAddr}
              onChange={(e) => setArbiterAddr(e.target.value)}
              placeholder="0x…"
              className="flex-1 rounded-xl px-3 py-2 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm stat-mono outline-none focus:ring-2 focus:ring-vlite-cyan"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => isAddress(arbiterAddr) && addArbiter(arbiterAddr as `0x${string}`)}
              disabled={busy}
              className="rounded-xl py-2 text-xs font-semibold bg-success/15 text-success"
            >
              Add arbiter
            </button>
            <button
              onClick={() => isAddress(arbiterAddr) && removeArbiter(arbiterAddr as `0x${string}`)}
              disabled={busy}
              className="rounded-xl py-2 text-xs font-semibold bg-danger/15 text-danger"
            >
              Remove arbiter
            </button>
          </div>
        </div>

        <div className="glass-panel p-4 space-y-2">
          <h3 className="font-semibold text-sm mb-1">Supported tokens</h3>
          {(Object.keys(TOKENS) as TokenSymbol[]).map((s) => (
            <div key={s} className="flex items-center justify-between text-sm py-1">
              <span>{s}</span>
              <button
                onClick={() => {
                  const next = !tokenToggles[s];
                  setTokenToggles((v) => ({ ...v, [s]: next }));
                  setSupportedToken(TOKENS[s].address, next);
                }}
                className={`text-xs font-semibold px-3 py-1 rounded-full ${tokenToggles[s] ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}
              >
                {tokenToggles[s] ? "Enabled" : "Disabled"}
              </button>
            </div>
          ))}
        </div>

        <div className="glass-panel p-4 space-y-2">
          <h3 className="font-semibold text-sm mb-1">Supported fiat currencies</h3>
          {FIAT_CURRENCIES.map((f) => (
            <div key={f.code} className="flex items-center justify-between text-sm py-1">
              <span>
                {f.flag} {f.code}
              </span>
              <button
                onClick={() => {
                  const next = !fiatToggles[f.code];
                  setFiatToggles((v) => ({ ...v, [f.code]: next }));
                  setSupportedFiat(f.code, next);
                }}
                className={`text-xs font-semibold px-3 py-1 rounded-full ${fiatToggles[f.code] ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}
              >
                {fiatToggles[f.code] ? "Enabled" : "Disabled"}
              </button>
            </div>
          ))}
        </div>

        <MerchantRecruitmentSettings />
        <SupportConfigSettings />
      </div>
    </AdminGate>
  );
}
