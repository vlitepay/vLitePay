"use client";

import { useMemo, useState } from "react";
import { LifeBuoy } from "lucide-react";
import { FAQ_CATEGORIES } from "@/lib/faq-data";
import { FaqSearch } from "@/components/support/FaqSearch";
import { FaqAccordionCategory } from "@/components/support/FaqAccordionCategory";
import { SupportContactCard } from "@/components/support/SupportContactCard";

export default function SupportPage() {
  const [query, setQuery] = useState("");

  const filteredCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQ_CATEGORIES;

    return FAQ_CATEGORIES.map((category) => ({
      ...category,
      items: category.items.filter(
        (item) => item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q)
      ),
    })).filter((category) => category.items.length > 0);
  }, [query]);

  return (
    <div className="space-y-4 animate-slide-up pb-6">
      <div>
        <h1 className="font-display text-xl font-semibold flex items-center gap-2">
          <LifeBuoy size={20} className="text-vlite-cyan" /> FAQ &amp; Support
        </h1>
        <p className="text-sm text-ink-muted mt-1">
          Guides for P2P trading, becoming a merchant, disputes, and escrow — searchable below.
        </p>
      </div>

      <FaqSearch value={query} onChange={setQuery} />

      {filteredCategories.length === 0 ? (
        <div className="glass-panel p-8 text-center text-sm text-ink-muted">
          No results for "{query}" — try a different search term, or reach out to the team below.
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCategories.map((category) => (
            <FaqAccordionCategory key={category.id} category={category} query={query.trim()} />
          ))}
        </div>
      )}

      <SupportContactCard />
    </div>
  );
}
