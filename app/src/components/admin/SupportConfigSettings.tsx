"use client";

import { useState } from "react";
import { LifeBuoy, Check } from "lucide-react";
import { useSupportConfigStore } from "@/store/useSupportConfigStore";

export function SupportConfigSettings() {
  const config = useSupportConfigStore((s) => s.config);
  const setConfig = useSupportConfigStore((s) => s.setConfig);
  const [draft, setDraft] = useState(config);
  const [saved, setSaved] = useState(false);

  function save() {
    setConfig(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  return (
    <div className="glass-panel p-4 space-y-3">
      <h3 className="font-semibold text-sm flex items-center gap-1.5">
        <LifeBuoy size={14} className="text-vlite-cyan" /> Support page contact info
      </h3>
      <p className="text-[11px] text-ink-muted">Shown on the FAQ &amp; Support page's "Still need help?" card.</p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-ink-muted">Support email</label>
          <input
            value={draft.email}
            onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            className="w-full mt-1 rounded-xl px-3 py-2 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
          />
        </div>
        <div>
          <label className="text-xs text-ink-muted">X / Twitter URL</label>
          <input
            value={draft.xUrl}
            onChange={(e) => setDraft((d) => ({ ...d, xUrl: e.target.value }))}
            className="w-full mt-1 rounded-xl px-3 py-2 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
          />
        </div>
        <div>
          <label className="text-xs text-ink-muted">Telegram URL</label>
          <input
            value={draft.telegramUrl}
            onChange={(e) => setDraft((d) => ({ ...d, telegramUrl: e.target.value }))}
            className="w-full mt-1 rounded-xl px-3 py-2 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
          />
        </div>
        <div>
          <label className="text-xs text-ink-muted">WhatsApp URL</label>
          <input
            value={draft.whatsappUrl}
            onChange={(e) => setDraft((d) => ({ ...d, whatsappUrl: e.target.value }))}
            className="w-full mt-1 rounded-xl px-3 py-2 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
          />
        </div>
      </div>

      <button onClick={save} className="btn-vlite-secondary w-full !py-2 text-sm flex items-center justify-center gap-1.5">
        {saved ? <Check size={14} className="text-success" /> : null}
        {saved ? "Saved" : "Save contact info"}
      </button>
    </div>
  );
}
