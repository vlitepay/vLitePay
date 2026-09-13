"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X, Send as SendIcon, Copy, Check, ShieldCheck, Link2, ExternalLink } from "lucide-react";
import { useReadContract } from "wagmi";
import { CONTRACTS } from "@/lib/constants";
import { p2pEscrowAbi } from "@/lib/abi/p2pEscrow";
import { useResolveUsername } from "@/hooks/useUsernameRegistry";
import type { ProfileRow } from "@/lib/types/database";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface SocialLinkLike {
  id: string;
  platform: string;
  url: string;
}

// Same defensive jsonb guard useProfileStore.ts's loadFromSupabase already
// applies to the same untyped `socials` column — kept local here rather
// than exported/shared, since it's a one-line shape check, not shared logic.
function isSocialLink(x: unknown): x is SocialLinkLike {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as Record<string, unknown>).id === "string" &&
    typeof (x as Record<string, unknown>).platform === "string" &&
    typeof (x as Record<string, unknown>).url === "string"
  );
}

function parseSocials(value: unknown): SocialLinkLike[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isSocialLink);
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Header search icon + overlay. Deliberately no Zustand store: `open` is
 * plain useState, so there's nothing to rehydrate into a stale "still
 * open" state on reload, and closing on route change is just an effect
 * keyed off usePathname() rather than something a store would need to
 * coordinate.
 */
export function SearchOverlay() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const pathname = usePathname();

  // Route change -> always closed.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Escape -> closed. Only listens while actually open.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setCopied(false);
    }
  }, [open]);

  const username = query.trim().toLowerCase();
  const looksLikeUsername = username.length >= 3;

  // Same resolve() read UsernameCard/RecipientInput already use for
  // username -> address — no new resolver, no eth_getLogs.
  const { data: resolved } = useResolveUsername(looksLikeUsername ? username : "");
  const resolvedAddress = resolved && resolved !== ZERO_ADDRESS ? (resolved as `0x${string}`) : null;

  const [profileRow, setProfileRow] = useState<ProfileRow | null>(null);
  useEffect(() => {
    if (!resolvedAddress) {
      setProfileRow(null);
      return;
    }
    let cancelled = false;
    // Same GET /api/profile read useProfileStore.ts's loadFromSupabase
    // already uses — no new backend path.
    fetch(`/api/profile?wallet=${encodeURIComponent(resolvedAddress)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!cancelled) setProfileRow((json?.profile as ProfileRow | null) ?? null);
      })
      .catch(() => {
        if (!cancelled) setProfileRow(null);
      });
    return () => {
      cancelled = true;
    };
  }, [resolvedAddress]);

  // Same isApprovedMerchant view MyShop/useMerchantStatus.ts already reads
  // — same ABI/function, just for the searched address instead of the
  // connected wallet. isPendingMerchant is deliberately not read: pending
  // merchants never show "Verified Merchant" here.
  const { data: isApprovedMerchant } = useReadContract({
    address: CONTRACTS.p2pEscrow,
    abi: p2pEscrowAbi,
    functionName: "isApprovedMerchant",
    args: [resolvedAddress ?? ZERO_ADDRESS],
    query: { enabled: !!resolvedAddress && !!CONTRACTS.p2pEscrow },
  });

  const socials = parseSocials(profileRow?.socials);

  function handleSend() {
    if (!username) return;
    // Existing SendPanel, existing Send tab — just pre-filled via ?to=.
    router.push(`/transfer?tab=send&to=${encodeURIComponent(username)}`);
    setOpen(false);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(`@${username}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable/denied — nothing safe to fall back to.
    }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn-vlite-icon" aria-label="Search">
        <Search size={17} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start md:items-center justify-center p-4"
            onClick={() => setOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, y: -20, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              onClick={(e) => e.stopPropagation()}
              className="glass-panel w-full max-w-sm mt-16 md:mt-0 p-5 space-y-4"
            >
              <div className="flex items-center gap-2">
                <div className="flex-1 flex items-center gap-2 rounded-xl px-3 py-2 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10">
                  <Search size={14} className="text-ink-muted shrink-0" />
                  <input
                    autoFocus
                    value={query}
                    onChange={(e) => setQuery(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                    placeholder="Search username…"
                    className="flex-1 bg-transparent outline-none text-sm"
                  />
                </div>
                <button onClick={() => setOpen(false)} className="btn-vlite-icon shrink-0" aria-label="Close search">
                  <X size={15} />
                </button>
              </div>

              {looksLikeUsername &&
                (resolvedAddress ? (
                  <div className="rounded-2xl bg-white/40 dark:bg-white/5 p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full overflow-hidden shrink-0 bg-vlite-gradient flex items-center justify-center text-white font-semibold">
                        {profileRow?.avatar_url ? (
                          <img src={profileRow.avatar_url} alt={username} className="h-full w-full object-cover" />
                        ) : (
                          shortAddr(resolvedAddress).slice(2, 4).toUpperCase()
                        )}
                      </div>
                      <div className="min-w-0">
                        <span className="font-semibold text-sm truncate block">@{username}</span>
                        <p className="text-xs text-ink-muted stat-mono">{shortAddr(resolvedAddress)}</p>
                      </div>
                    </div>

                    {!!isApprovedMerchant && (
                      <p className="text-xs font-medium text-success flex items-center gap-1">
                        <ShieldCheck size={12} /> Verified Merchant
                      </p>
                    )}

                    {profileRow?.bio && <p className="text-sm">{profileRow.bio}</p>}

                    {socials.length > 0 && (
                      <div className="space-y-1.5">
                        {socials.map((s) => (
                          <a
                            key={s.id}
                            href={s.url.startsWith("http") ? s.url : `https://${s.url}`}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-1.5 text-xs text-vlite-purple dark:text-vlite-cyan hover:underline truncate"
                          >
                            <Link2 size={11} className="shrink-0" /> {s.platform} <ExternalLink size={10} className="shrink-0" />
                          </a>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleSend}
                        className="btn-vlite-primary flex-1 !py-2 text-sm flex items-center justify-center gap-1.5"
                      >
                        <SendIcon size={13} /> Send
                      </button>
                      <button
                        onClick={handleCopy}
                        className="glass-panel-flush px-3 py-2 rounded-xl text-xs font-semibold flex items-center gap-1.5 shrink-0"
                      >
                        {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
                        {copied ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-ink-muted text-center py-3">No user found for @{username}.</p>
                ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
