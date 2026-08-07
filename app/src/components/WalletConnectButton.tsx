"use client";

import { useState } from "react";
import { useAccount, useDisconnect } from "wagmi";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, Copy, Check, ExternalLink, LogOut } from "lucide-react";
import { useVLiteStore } from "@/store/useVLiteStore";
import { useProfileStore } from "@/store/useProfileStore";
import { useUsernameOf } from "@/hooks/useUsernameRegistry";
import { VLiteLogo } from "./VLiteLogo";

function shortAddress(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Post-auth account control shown in the header. The actual "not connected"
 * experience now lives entirely in <ConnectScreen /> (see components/auth/),
 * since <AuthGate /> prevents the header from ever rendering before a wallet
 * or Circle email session exists. This component shows the account avatar +
 * a dropdown with identity details and sign-out.
 */
export function WalletConnectButton() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const storedAddress = useVLiteStore((s) => s.address);
  const authMethod = useVLiteStore((s) => s.authMethod);
  const clearAuth = useVLiteStore((s) => s.clearAuth);
  const displayAddress = address || storedAddress;
  const avatarDataUrl = useProfileStore((s) => s.getProfile(displayAddress || undefined).avatarDataUrl);
  // Same reverseResolve lookup the Profile page already uses successfully —
  // useVLiteStore's `username` field is never actually populated by the
  // auth flow (wallet or Circle), which is why this dropdown previously
  // only ever showed the address.
  const { data: username } = useUsernameOf(displayAddress ?? undefined);

  if (!displayAddress) return null;

  function handleLogout() {
    setOpen(false);
    if (isConnected) disconnect(); // triggers AuthSync -> clearAuth() for wallet sessions
    if (authMethod === "circle-email") clearAuth();
  }

  function handleCopy() {
    navigator.clipboard.writeText(displayAddress as string);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="glass-panel-flush rounded-full pl-1 pr-2 py-1 flex items-center gap-1.5 hover:bg-white/60 dark:hover:bg-white/10 transition"
        aria-label="Account menu"
      >
        <span className="h-7 w-7 rounded-full overflow-hidden shrink-0">
          {avatarDataUrl ? (
            <img src={avatarDataUrl} alt="Avatar" className="h-full w-full object-cover" />
          ) : (
            <span className="h-full w-full bg-vlite-gradient flex items-center justify-center">
              <VLiteLogo size={16} />
            </span>
          )}
        </span>
        <ChevronDown size={14} className="text-ink-muted" />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="glass-panel absolute right-0 mt-2 w-64 z-50 overflow-hidden"
            >
              <div className="px-4 py-3 border-b border-white/15 dark:border-white/5">
                {username && <p className="text-sm font-semibold truncate">{username}</p>}
                <p className="text-xs text-ink-muted stat-mono truncate">{shortAddress(displayAddress)}</p>
              </div>

              <div className="py-1">
                <button
                  onClick={handleCopy}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-white/40 dark:hover:bg-white/5 transition"
                >
                  {copied ? <Check size={15} className="text-success" /> : <Copy size={15} className="text-ink-muted" />}
                  {copied ? "Copied" : "Copy address"}
                </button>

                <a
                  href={`https://testnet.arcscan.app/address/${displayAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-white/40 dark:hover:bg-white/5 transition"
                >
                  <ExternalLink size={15} className="text-ink-muted" />
                  View on Explorer
                </a>

                <button
                  onClick={handleLogout}
                  className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-danger hover:bg-white/40 dark:hover:bg-white/5 transition"
                >
                  <LogOut size={15} />
                  Disconnect
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
