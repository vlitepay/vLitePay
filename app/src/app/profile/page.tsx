"use client";

import { useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { ShieldCheck, ChevronRight, LogIn, LifeBuoy } from "lucide-react";
import { motion } from "framer-motion";
import clsx from "clsx";
import { useAdminRole } from "@/hooks/useAdminRole";
import { useMyUsername } from "@/hooks/useUsernameRegistry";
import { useProfileStore } from "@/store/useProfileStore";
import { AvatarUpload } from "@/components/profile/AvatarUpload";
import { BioEditor } from "@/components/profile/BioEditor";
import { SocialLinksEditor } from "@/components/profile/SocialLinksEditor";
import { BankDetailsEditor } from "@/components/profile/BankDetailsEditor";
import { MerchantApplicationCard } from "@/components/profile/MerchantApplicationCard";
import { TradeHistoryList } from "@/components/profile/TradeHistoryList";
import { ProfileCompletenessCard } from "@/components/profile/ProfileCompletenessCard";

function shortAddr(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

type ProfileTab = "history" | "settings";

export default function ProfilePage() {
  const { address, isConnected } = useAccount();
  const { canAccessAdmin } = useAdminRole();
  const { data: username } = useMyUsername();
  const avatarDataUrl = useProfileStore((s) => s.getProfile(address).avatarDataUrl);
  const [tab, setTab] = useState<ProfileTab>("settings");

  if (!isConnected) {
    return (
      <div className="glass-panel p-8 text-center space-y-3 mt-4">
        <LogIn className="mx-auto text-vlite-indigo" size={26} />
        <h1 className="font-display text-xl font-semibold">Profile</h1>
        <p className="text-sm text-ink-muted">Connect your wallet to view and edit your profile.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 animate-slide-up pb-6">
      <div className="glass-panel-flush rounded-2xl p-1 flex">
        {(["history", "settings"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              "flex-1 rounded-xl py-2.5 text-sm font-semibold capitalize transition-colors",
              tab === t ? "bg-vlite-gradient text-white shadow-glow" : "text-ink-muted hover:text-ink-light dark:hover:text-ink-dark"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "history" ? (
        <TradeHistoryList />
      ) : (
        <div className="space-y-4">
          <ProfileCompletenessCard hasUsername={!!username} hasAvatar={!!avatarDataUrl} />

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-6 text-center space-y-3">
            <AvatarUpload />
            <div>
              <p className="font-display text-lg font-semibold">{username ? `@${username}` : shortAddr(address!)}</p>
              {username && <p className="text-xs text-ink-muted stat-mono">{shortAddr(address!)}</p>}
            </div>
            <BioEditor />
          </motion.div>

          <div className="glass-panel p-5">
            <SocialLinksEditor />
          </div>

          <div className="glass-panel p-5">
            <BankDetailsEditor />
          </div>

          <MerchantApplicationCard />

          <Link href="/support" className="glass-panel flex items-center justify-between p-4 hover:-translate-y-0.5 transition-transform">
            <span className="flex items-center gap-2.5 text-sm font-medium">
              <LifeBuoy size={16} className="text-vlite-cyan" /> FAQ &amp; Support
            </span>
            <ChevronRight size={16} className="text-ink-muted" />
          </Link>

          {canAccessAdmin && (
            <Link href="/admin" className="glass-panel flex items-center justify-between p-4 hover:-translate-y-0.5 transition-transform">
              <span className="flex items-center gap-2.5 text-sm font-medium">
                <ShieldCheck size={16} className="text-vlite-cyan" /> Admin panel
              </span>
              <ChevronRight size={16} className="text-ink-muted" />
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
