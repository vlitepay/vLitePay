"use client";

import { MessageCircle, Send, Mail, AtSign } from "lucide-react";
import { useMerchantRecruitmentStore } from "@/store/useMerchantRecruitmentStore";

export function MerchantContactNote() {
  const { note, xUrl, telegramUrl, whatsappUrl, email } = useMerchantRecruitmentStore((s) => s.config);

  const links = [
    { label: "X / Twitter", href: xUrl, icon: AtSign },
    { label: "Telegram", href: telegramUrl, icon: Send },
    { label: "WhatsApp", href: whatsappUrl, icon: MessageCircle },
    { label: "Email", href: `mailto:${email}`, icon: Mail },
  ];

  return (
    <div className="rounded-2xl bg-white/40 dark:bg-white/5 p-3.5 space-y-2.5">
      <p className="text-xs text-ink-muted">{note}</p>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <a
            key={l.label}
            href={l.href}
            target={l.label === "Email" ? undefined : "_blank"}
            rel="noreferrer"
            className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium glass-panel-flush hover:bg-white/60 dark:hover:bg-white/10 transition text-vlite-purple dark:text-vlite-cyan"
          >
            <l.icon size={12} />
            {l.label}
          </a>
        ))}
      </div>
    </div>
  );
}
