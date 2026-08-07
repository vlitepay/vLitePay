"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { QRCodeSVG } from "qrcode.react";
import { Copy, Check } from "lucide-react";
import clsx from "clsx";
import { TOKENS, TokenSymbol } from "@/lib/constants";
import { useMyUsername } from "@/hooks/useUsernameRegistry";
import { VLiteLogo } from "@/components/VLiteLogo";

export function DepositPanel() {
  const { address } = useAccount();
  const { data: username } = useMyUsername();
  const [token, setToken] = useState<TokenSymbol>("USDC");
  const [copied, setCopied] = useState(false);

  function copy() {
    if (!address) return;
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!address) {
    return <div className="glass-panel p-8 text-center text-sm text-ink-muted">Connect your wallet to deposit.</div>;
  }

  return (
    <div className="glass-panel p-5 space-y-4 text-center">
      <div className="grid grid-cols-3 gap-2">
        {(Object.keys(TOKENS) as TokenSymbol[]).map((t) => (
          <button
            key={t}
            onClick={() => setToken(t)}
            className={clsx(
              "rounded-xl py-2 text-xs font-semibold transition-colors",
              token === t ? "bg-vlite-gradient text-white shadow-glow" : "glass-panel-flush text-ink-muted"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="relative inline-block mx-auto p-4 rounded-3xl bg-white">
        <QRCodeSVG value={address} size={200} fgColor="#0B0E1A" bgColor="#FFFFFF" level="M" />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="bg-white rounded-xl p-1 shadow-lg">
            <VLiteLogo size={32} />
          </div>
        </div>
      </div>

      <div>
        {username && <p className="font-semibold">@{username}</p>}
        <p className="stat-mono text-sm text-ink-muted break-all mt-1">{address}</p>
      </div>

      <button onClick={copy} className="btn-vlite-secondary mx-auto !py-2 text-sm">
        {copied ? <Check size={15} className="text-success" /> : <Copy size={15} />}
        {copied ? "Copied" : "Copy address"}
      </button>

      <p className="text-[11px] text-ink-muted">
        Only send {token} on <span className="font-medium">Arc Testnet</span> to this address. Sending other assets or
        networks may result in permanent loss.
      </p>
    </div>
  );
}
