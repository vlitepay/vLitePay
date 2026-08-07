"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { Check, Pencil } from "lucide-react";
import { useProfileStore } from "@/store/useProfileStore";

export function BioEditor() {
  const { address } = useAccount();
  const profile = useProfileStore((s) => s.getProfile(address));
  const setBio = useProfileStore((s) => s.setBio);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(profile.bio);

  function save() {
    if (address) setBio(address, draft.trim());
    setEditing(false);
  }

  if (!editing) {
    return (
      <button onClick={() => { setDraft(profile.bio); setEditing(true); }} className="text-left w-full group">
        <p className={profile.bio ? "text-sm" : "text-sm text-ink-muted italic"}>
          {profile.bio || "Add a short bio…"}
        </p>
        <span className="text-xs text-vlite-purple dark:text-vlite-cyan opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 mt-1">
          <Pencil size={11} /> Edit
        </span>
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={3}
        maxLength={280}
        placeholder="Tell people a bit about you or your shop…"
        className="w-full rounded-xl px-3 py-2.5 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan resize-none"
      />
      <div className="flex justify-end gap-2">
        <button onClick={() => setEditing(false)} className="text-xs font-medium text-ink-muted px-3 py-1.5">
          Cancel
        </button>
        <button onClick={save} className="text-xs font-semibold px-3 py-1.5 rounded-full bg-vlite-gradient text-white shadow-glow flex items-center gap-1">
          <Check size={12} /> Save
        </button>
      </div>
    </div>
  );
}
