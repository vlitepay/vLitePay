"use client";

import { useState } from "react";
import Link from "next/link";
import { isAddress } from "viem";
import { ArrowLeft, Check, X, Ban } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";
import { useMerchantApplications } from "@/hooks/useMerchantApplications";
import { useAdminActions } from "@/hooks/useAdminActions";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function AdminMerchantsPage() {
  const { applications, isLoading, refetch } = useMerchantApplications();
  const { approveMerchant, rejectMerchant, restrictMerchant, busy, error } = useAdminActions();
  const [manualAddr, setManualAddr] = useState("");

  async function act(fn: (a: `0x${string}`) => Promise<string | null>, addr: string) {
    if (!isAddress(addr)) return;
    const hash = await fn(addr as `0x${string}`);
    if (hash) refetch();
  }

  return (
    <AdminGate requireOwner>
      <div className="space-y-4 animate-slide-up">
        <Link href="/admin" className="flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink-light dark:hover:text-ink-dark">
          <ArrowLeft size={15} /> Back to admin
        </Link>
        <h1 className="font-display text-xl font-semibold">Merchant Management</h1>

        <div className="glass-panel p-4 space-y-2">
          <p className="text-sm font-medium">Act on a specific address</p>
          <div className="flex gap-2">
            <input
              value={manualAddr}
              onChange={(e) => setManualAddr(e.target.value)}
              placeholder="0x…"
              className="flex-1 rounded-xl px-3 py-2 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm stat-mono outline-none focus:ring-2 focus:ring-vlite-cyan"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => act(approveMerchant, manualAddr)} disabled={busy} className="rounded-xl py-2 text-xs font-semibold bg-success/15 text-success">
              Approve
            </button>
            <button onClick={() => act(rejectMerchant, manualAddr)} disabled={busy} className="rounded-xl py-2 text-xs font-semibold bg-warning/15 text-warning">
              Reject
            </button>
            <button onClick={() => act(restrictMerchant, manualAddr)} disabled={busy} className="rounded-xl py-2 text-xs font-semibold bg-danger/15 text-danger">
              Restrict
            </button>
          </div>
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>

        <div>
          <h2 className="text-sm font-semibold text-ink-muted mb-2 px-1">Applications</h2>
          {isLoading ? (
            <div className="glass-panel h-24 animate-pulse bg-white/40 dark:bg-white/5" />
          ) : applications.length === 0 ? (
            <div className="glass-panel p-6 text-center text-sm text-ink-muted">No applications found yet.</div>
          ) : (
            <div className="space-y-2">
              {applications.map((a) => (
                <div key={a.address} className="glass-panel flex items-center justify-between p-3.5">
                  <div>
                    <p className="stat-mono text-sm">{shortAddr(a.address)}</p>
                    <p className="text-xs text-ink-muted">
                      {a.isApproved ? "Approved" : a.isPending ? "Pending review" : "Not pending"}
                    </p>
                  </div>
                  {!a.isApproved && a.isPending && (
                    <div className="flex gap-1.5">
                      <button onClick={() => act(approveMerchant, a.address)} className="btn-vlite-icon h-8 w-8" aria-label="Approve">
                        <Check size={14} className="text-success" />
                      </button>
                      <button onClick={() => act(rejectMerchant, a.address)} className="btn-vlite-icon h-8 w-8" aria-label="Reject">
                        <X size={14} className="text-warning" />
                      </button>
                    </div>
                  )}
                  {a.isApproved && (
                    <button onClick={() => act(restrictMerchant, a.address)} className="btn-vlite-icon h-8 w-8" aria-label="Restrict">
                      <Ban size={14} className="text-danger" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </AdminGate>
  );
}
