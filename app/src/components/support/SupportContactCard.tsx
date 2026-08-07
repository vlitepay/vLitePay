"use client";

import { MessageCircle, Send, Mail, AtSign, LifeBuoy } from "lucide-react";
import { useSupportConfigStore } from "@/store/useSupportConfigStore";

export function SupportContactCard() {
  const { email, xUrl, telegramUrl, whatsappUrl } = useSupportConfigStore((s) => s.config);

  const links = [
    { label: "X / Twitter", href: xUrl, icon: AtSign },
    { label: "Telegram", href: telegramUrl, icon: Send },
    { label: "WhatsApp", href: whatsappUrl, icon: MessageCircle },
    { label: "Email", href: `mailto:${email}`, icon: Mail, sub: email },
  ];

  return (
    <div className="glass-panel p-5 space-y-3">
      <h2 className="font-semibold text-sm flex items-center gap-1.5">
        <LifeBuoy size={15} className="text-vlite-cyan" /> Still need help?
      </h2>
      <p className="text-xs text-ink-muted">
        Can't find your answer above? Reach the vLitePay team directly — we're happy to help.
      </p>
      <div className="grid grid-cols-2 gap-2">
        {links.map((l) => (
          <a
            key={l.label}
            href={l.href}
            target={l.label === "Email" ? undefined : "_blank"}
            rel="noreferrer"
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 glass-panel-flush hover:bg-white/60 dark:hover:bg-white/10 transition"
          >
            <l.icon size={15} className="text-vlite-purple dark:text-vlite-cyan shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{l.label}</p>
              {l.sub && <p className="text-[10px] text-ink-muted truncate">{l.sub}</p>}
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
