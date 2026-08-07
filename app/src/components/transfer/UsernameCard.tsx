"use client";

import { useState } from "react";
import { useAccount, useReadContract } from "wagmi";
import { AtSign, Search, CheckCircle2, XCircle } from "lucide-react";
import { CONTRACTS } from "@/lib/constants";
import { usernameRegistryAbi } from "@/lib/abi/usernameRegistry";
import { useMyUsername, useResolveUsername, useUsernameActions } from "@/hooks/useUsernameRegistry";
import { notify } from "@/lib/notify";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function UsernameCard() {
  const { address, isConnected } = useAccount();
  const { data: myUsername, refetch } = useMyUsername();
  const { register, busy, error } = useUsernameActions();

  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");

  const { data: draftAvailable } = useReadContract({
    address: CONTRACTS.usernameRegistry,
    abi: usernameRegistryAbi,
    functionName: "isAvailable",
    args: [draft],
    query: { enabled: draft.length >= 3 },
  });

  const { data: registrationFee } = useReadContract({
    address: CONTRACTS.usernameRegistry,
    abi: usernameRegistryAbi,
    functionName: "registrationFee",
    query: { enabled: !!CONTRACTS.usernameRegistry },
  });

  const { data: searchResult } = useResolveUsername(search);

  if (!isConnected) return null;

  const hasUsername = !!myUsername;

  async function handleRegister() {
    if (!draft || !draftAvailable) return;
    const registeredName = draft;
    const hash = await register(draft, (registrationFee as bigint) ?? 1_000_000n);
    if (hash) {
      setDraft("");
      refetch();
      notify({
        category: "username",
        title: "Username registered",
        message: `@${registeredName} is now linked to your wallet — share it instead of your address.`,
        href: "/transfer",
      });
    }
  }

  return (
    <div className="glass-panel p-5 space-y-4">
      <h3 className="font-semibold text-sm flex items-center gap-1.5">
        <AtSign size={15} className="text-vlite-cyan" /> Username
      </h3>

      {hasUsername ? (
        <p className="text-sm">
          You're <span className="font-semibold">@{myUsername}</span> — share it instead of your address.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-ink-muted">
            Register a username so people can send you money without copying your address.
          </p>
          <div className="flex gap-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="yourname"
              className="flex-1 rounded-xl px-3 py-2 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
            />
            <button onClick={handleRegister} disabled={!draft || !draftAvailable || busy} className="btn-vlite-primary !py-2 !px-4 text-sm shrink-0">
              {busy ? "Registering…" : "Register"}
            </button>
          </div>
          {draft.length >= 3 && (
            <p className={draftAvailable ? "text-xs text-success flex items-center gap-1" : "text-xs text-danger flex items-center gap-1"}>
              {draftAvailable ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              {draftAvailable ? "Available" : "Already taken"}
            </p>
          )}
          {error && <p className="text-xs text-danger">{error}</p>}
        </div>
      )}

      <div className="pt-3 border-t border-white/15 dark:border-white/5 space-y-2">
        <label className="text-xs text-ink-muted flex items-center gap-1.5">
          <Search size={12} /> Look up a username
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value.toLowerCase())}
          placeholder="search username…"
          className="w-full rounded-xl px-3 py-2 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
        />
        {search.length >= 3 && searchResult && searchResult !== "0x0000000000000000000000000000000000000000" && (
          <div className="rounded-xl bg-white/40 dark:bg-white/5 p-2.5 flex items-center justify-between text-sm">
            <span className="font-medium">@{search}</span>
            <span className="stat-mono text-ink-muted">{shortAddr(searchResult)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
