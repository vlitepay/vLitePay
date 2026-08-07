"use client";

import { useMemo, useState } from "react";
import { formatUnits } from "viem";
import { Inbox } from "lucide-react";
import { useP2PStore } from "@/store/useP2PStore";
import { useOffers } from "@/hooks/useOffers";
import { TOKENS } from "@/lib/constants";
import { OfferCard } from "./OfferCard";
import { SearchMerchantInput } from "./SearchMerchantInput";

export function OfferList() {
  const selectedToken = useP2PStore((s) => s.selectedToken);
  const selectedFiat = useP2PStore((s) => s.selectedFiat);
  const offerSideForTab = useP2PStore((s) => s.offerSideForTab);
  const [search, setSearch] = useState("");

  const { offers, isLoading } = useOffers(selectedToken, selectedFiat, offerSideForTab());

  const filteredOffers = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return offers;

    const asAmount = Number(query.replace(/,/g, ""));
    const token = TOKENS[selectedToken];

    return offers.filter((offer) => {
      const matchesMerchant = offer.merchant.toLowerCase().includes(query);
      if (matchesMerchant) return true;

      if (!Number.isNaN(asAmount) && asAmount > 0) {
        const min = Number(formatUnits(offer.minAmount, token.decimals));
        const max = Number(formatUnits(offer.maxAmount, token.decimals));
        return asAmount >= min && asAmount <= max;
      }

      return false;
    });
  }, [offers, search, selectedToken]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <SearchMerchantInput value={search} onChange={setSearch} />
        {[0, 1, 2].map((i) => (
          <div key={i} className="glass-panel h-[72px] animate-pulse bg-white/40 dark:bg-white/5" />
        ))}
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="space-y-3">
        <SearchMerchantInput value={search} onChange={setSearch} />
        <div className="glass-panel flex flex-col items-center justify-center gap-2 py-12 text-center">
          <Inbox size={28} className="text-ink-muted" />
          <p className="text-sm font-medium">No offers for this pair yet</p>
          <p className="text-xs text-ink-muted max-w-[220px]">
            Try another currency pair, or check back soon — merchants add new offers regularly.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <SearchMerchantInput value={search} onChange={setSearch} />

      {filteredOffers.length === 0 ? (
        <div className="glass-panel flex flex-col items-center justify-center gap-2 py-12 text-center">
          <Inbox size={28} className="text-ink-muted" />
          <p className="text-sm font-medium">No matching offers</p>
          <p className="text-xs text-ink-muted max-w-[220px]">Try a different merchant address or amount.</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {filteredOffers.map((offer, i) => (
            <OfferCard key={offer.id.toString()} offer={offer} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
