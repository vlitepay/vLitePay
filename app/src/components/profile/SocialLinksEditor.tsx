"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { Link2, Plus, X, ExternalLink } from "lucide-react";
import { useProfileStore } from "@/store/useProfileStore";

const PLATFORM_OPTIONS = ["X / Twitter", "Instagram", "Telegram", "WhatsApp", "Website", "Other"];

export function SocialLinksEditor() {
  const { address } = useAccount();
  const profile = useProfileStore((s) => s.getProfile(address));
  const addSocial = useProfileStore((s) => s.addSocial);
  const removeSocial = useProfileStore((s) => s.removeSocial);

  const [platform, setPlatform] = useState(PLATFORM_OPTIONS[0]);
  const [url, setUrl] = useState("");

  function handleAdd() {
    if (!address || !url.trim()) return;
    addSocial(address, { id: `${Date.now()}`, platform, url: url.trim() });
    setUrl("");
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-1.5">
        <Link2 size={14} className="text-vlite-cyan" /> Social links
      </h3>

      {profile.socials.length > 0 && (
        <div className="space-y-1.5">
          {profile.socials.map((s) => (
            <div key={s.id} className="flex items-center justify-between rounded-xl bg-white/40 dark:bg-white/5 px-3 py-2 text-sm">
              <a
                href={s.url.startsWith("http") ? s.url : `https://${s.url}`}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-vlite-purple dark:text-vlite-cyan hover:underline truncate"
              >
                {s.platform} <ExternalLink size={11} className="shrink-0" />
              </a>
              <button onClick={() => address && removeSocial(address, s.id)} aria-label="Remove link">
                <X size={13} className="text-ink-muted hover:text-danger" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="rounded-xl px-2 py-2 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-xs outline-none focus:ring-2 focus:ring-vlite-cyan"
        >
          {PLATFORM_OPTIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="link or handle"
          className="flex-1 rounded-xl px-3 py-2 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
        />
        <button onClick={handleAdd} className="btn-vlite-icon shrink-0" aria-label="Add link">
          <Plus size={15} />
        </button>
      </div>
    </div>
  );
}
