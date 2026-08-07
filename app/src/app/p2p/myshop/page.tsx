"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { Store, Clock, ShieldCheck } from "lucide-react";
import { useMerchantStatus } from "@/hooks/useMerchantStatus";
import { useMerchantActions } from "@/hooks/useMerchantActions";
import { useMyOffers } from "@/hooks/useMyOffers";
import { MerchantOfferForm } from "@/components/merchant/MerchantOfferForm";
import { MyOfferCard } from "@/components/merchant/MyOfferCard";
import { MerchantContactNote } from "@/components/profile/MerchantContactNote";
import { notify } from "@/lib/notify";

export default function MyShopPage() {
  const { address, isConnected } = useAccount();
  const { isApproved, isPending, isLoading, refetch } = useMerchantStatus();
  const { applyForMerchant, busy, error } = useMerchantActions();
  const { offers, isLoading: offersLoading, refetch: refetchOffers } = useMyOffers();
  const [showForm, setShowForm] = useState(false);

  if (!isConnected) {
    return (
      <div className="glass-panel p-8 text-center space-y-3 mt-4">
        <Store className="mx-auto text-vlite-purple" size={28} />
        <h1 className="font-display text-xl font-semibold">MyShop</h1>
        <p className="text-sm text-ink-muted">Connect your wallet to apply as a merchant.</p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="glass-panel h-48 animate-pulse bg-white/40 dark:bg-white/5 mt-4" />;
  }

  if (!isApproved) {
    return (
      <div className="glass-panel p-8 text-center space-y-3 mt-4">
        {isPending ? (
          <>
            <Clock className="mx-auto text-warning" size={28} />
            <h1 className="font-display text-xl font-semibold">Application pending</h1>
            <p className="text-sm text-ink-muted max-w-xs mx-auto">
              Your merchant application is being reviewed by the vLitePay team. You'll be able to post offers as soon
              as you're approved.
            </p>
          </>
        ) : (
          <>
            <Store className="mx-auto text-vlite-purple" size={28} />
            <h1 className="font-display text-xl font-semibold">Become a merchant</h1>
            <p className="text-sm text-ink-muted max-w-xs mx-auto">
              Approved merchants can post buy/sell offers, set their own rates, and build a trading reputation on
              vLitePay.
            </p>
            <div className="w-full max-w-xs mx-auto">
              <MerchantContactNote />
            </div>
            {error && <p className="text-sm text-danger">{error}</p>}
            <button
              onClick={async () => {
                const hash = await applyForMerchant();
                if (hash) {
                  refetch();
                  notify({
                    category: "merchant",
                    title: "Merchant application submitted",
                    message: "We'll review your application — reach out via the links above if you'd like to speed things up.",
                    href: "/p2p/myshop",
                  });
                }
              }}
              disabled={busy}
              className="btn-vlite-primary mx-auto"
            >
              {busy ? "Submitting…" : "Apply now"}
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-slide-up">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold flex items-center gap-2">
            <Store size={20} className="text-vlite-purple" /> MyShop
          </h1>
          <p className="text-xs text-ink-muted flex items-center gap-1 mt-0.5">
            <ShieldCheck size={12} className="text-success" /> Approved merchant
          </p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="btn-vlite-primary !py-2 !px-4 text-sm">
          {showForm ? "Close" : "New offer"}
        </button>
      </div>

      {showForm && (
        <MerchantOfferForm
          onCreated={() => {
            setShowForm(false);
            refetchOffers();
          }}
        />
      )}

      <div>
        <h2 className="text-sm font-semibold text-ink-muted mb-2 px-1">Your offers</h2>
        {offersLoading ? (
          <div className="glass-panel h-24 animate-pulse bg-white/40 dark:bg-white/5" />
        ) : offers.length === 0 ? (
          <div className="glass-panel p-6 text-center text-sm text-ink-muted">You haven't posted any offers yet.</div>
        ) : (
          <div className="space-y-2.5">
            {offers.map((o) => (
              <MyOfferCard key={o.id.toString()} offer={o} onChanged={refetchOffers} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
