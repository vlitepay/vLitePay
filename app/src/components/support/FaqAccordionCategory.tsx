"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Repeat, Store, Scale, Lock, Wallet, Percent } from "lucide-react";
import { FaqCategory } from "@/lib/faq-data";

const ICONS = { trade: Repeat, merchant: Store, dispute: Scale, escrow: Lock, wallet: Wallet, fees: Percent };
const ICON_COLOR = {
  trade: "text-vlite-purple",
  merchant: "text-vlite-purple",
  dispute: "text-warning",
  escrow: "text-vlite-cyan",
  wallet: "text-success",
  fees: "text-vlite-gold",
};

function highlightMatch(text: string, query: string) {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-vlite-gold/40 text-inherit rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function FaqAccordionCategory({ category, query }: { category: FaqCategory; query: string }) {
  const [openId, setOpenId] = useState<string | null>(category.items[0]?.id ?? null);
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const Icon = ICONS[category.icon];
  const searching = query.trim().length > 0;

  function itemMatches(item: (typeof category.items)[number]) {
    const q = query.toLowerCase();
    return item.question.toLowerCase().includes(q) || item.answer.toLowerCase().includes(q);
  }

  function isOpen(item: (typeof category.items)[number]) {
    if (searching) {
      return overrides[item.id] ?? itemMatches(item);
    }
    return openId === item.id;
  }

  function toggle(item: (typeof category.items)[number]) {
    if (searching) {
      setOverrides((o) => ({ ...o, [item.id]: !isOpen(item) }));
    } else {
      setOpenId((id) => (id === item.id ? null : item.id));
    }
  }

  return (
    <div className="glass-panel overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-white/15 dark:border-white/5">
        <div className={`h-8 w-8 rounded-full glass-panel-flush flex items-center justify-center shrink-0 ${ICON_COLOR[category.icon]}`}>
          <Icon size={15} />
        </div>
        <h2 className="font-semibold text-sm">{category.title}</h2>
      </div>

      <div>
        {category.items.map((item) => {
          const open = isOpen(item);
          return (
            <div key={item.id} className="border-b border-white/10 dark:border-white/5 last:border-0">
              <button
                onClick={() => toggle(item)}
                className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left hover:bg-white/40 dark:hover:bg-white/5 transition"
              >
                <span className="text-sm font-medium">{highlightMatch(item.question, query)}</span>
                <ChevronDown size={14} className={`shrink-0 text-ink-muted transition-transform ${open ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="px-4 pb-4 text-sm text-ink-muted whitespace-pre-line leading-relaxed">
                      {highlightMatch(item.answer, query)}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
