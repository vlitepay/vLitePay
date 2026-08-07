"use client";

import Link from "next/link";
import { Store } from "lucide-react";
import { GlobalReferenceRateCard } from "@/components/p2p/GlobalReferenceRateCard";
import { CurrencyPairSelector } from "@/components/p2p/CurrencyPairSelector";
import { BuySellTabs } from "@/components/p2p/BuySellTabs";
import { OfferList } from "@/components/p2p/OfferList";

export default function P2PPage() {
  return (
    <div className="space-y-4 animate-slide-up">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-semibold">P2P Trading</h1>
        <Link
          href="/p2p/myshop"
          className="glass-panel-flush rounded-full px-3 py-1.5 flex items-center gap-1.5 text-xs font-medium hover:bg-white/60 dark:hover:bg-white/10 transition"
        >
          <Store size={13} className="text-vlite-purple" />
          MyShop
        </Link>
      </div>

      <GlobalReferenceRateCard />

      <CurrencyPairSelector />
      <BuySellTabs />
      <OfferList />
    </div>
  );
}
