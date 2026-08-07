"use client";

import Link from "next/link";
import { Store, Clock, ShieldCheck, ChevronRight } from "lucide-react";
import { useMerchantStatus } from "@/hooks/useMerchantStatus";
import { useMerchantActions } from "@/hooks/useMerchantActions";
import { MerchantContactNote } from "./MerchantContactNote";
import { notify } from "@/lib/notify";

export function MerchantApplicationCard() {
  const { isApproved, isPending, isLoading, refetch } = useMerchantStatus();
  const { applyForMerchant, busy, error } = useMerchantActions();

  if (isLoading) return <div className="glass-panel h-16 animate-pulse bg-white/40 dark:bg-white/5" />;

  if (isApproved) {
    return (
      <Link href="/p2p/myshop" className="glass-panel flex items-center justify-between p-4 hover:-translate-y-0.5 transition-transform">
        <span className="flex items-center gap-2.5 text-sm font-medium">
          <ShieldCheck size={16} className="text-success" /> You're an approved merchant — open MyShop
        </span>
        <ChevronRight size={16} className="text-ink-muted" />
      </Link>
    );
  }

  if (isPending) {
    return (
      <div className="glass-panel flex items-center gap-2.5 p-4 text-sm">
        <Clock size={16} className="text-warning" />
        Merchant application pending review
      </div>
    );
  }

  return (
    <div className="glass-panel p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2.5 text-sm font-medium">
          <Store size={16} className="text-vlite-purple" /> Become a merchant
        </span>
        <button
          onClick={async () => {
            const hash = await applyForMerchant();
            if (hash) {
              refetch();
              notify({
                category: "merchant",
                title: "Merchant application submitted",
                message: "We'll review your application — reach out via the links above if you'd like to speed things up.",
                href: "/profile",
              });
            }
          }}
          disabled={busy}
          className="btn-vlite-primary !py-1.5 !px-3.5 text-xs shrink-0"
        >
          {busy ? "Applying…" : "Apply"}
        </button>
      </div>
      <MerchantContactNote />
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
