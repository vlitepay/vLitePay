"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { Home, Send, Repeat, Smartphone, User } from "lucide-react";
import { NAV_ITEMS } from "@/lib/constants";

const ICONS = { home: Home, transfer: Send, p2p: Repeat, airtime: Smartphone, profile: User };

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 md:hidden">
      <div className="mx-3 mb-3 glass-panel px-2 py-2 flex items-center justify-between">
        {NAV_ITEMS.map((item) => {
          const Icon = ICONS[item.key];
          const active = pathname === item.href;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={clsx(
                "flex flex-1 flex-col items-center gap-1 rounded-xl py-2 transition-colors",
                active ? "text-vlite-purple dark:text-vlite-cyan" : "text-ink-muted"
              )}
            >
              <div className={clsx("relative", active && "drop-shadow-[0_0_8px_rgba(124,58,237,0.5)]")}>
                <Icon size={20} strokeWidth={active ? 2.4 : 2} />
              </div>
              <span className="text-[11px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
