import Link from "next/link";
import { VLiteLogo } from "./VLiteLogo";
import { VLiteWordmark } from "./VLiteWordmark";
import { ThemeToggle } from "./ThemeToggle";
import { WalletConnectButton } from "./WalletConnectButton";
import { NotificationBell } from "./NotificationBell";
import { NAV_ITEMS } from "@/lib/constants";

export function Header() {
  return (
    <header className="sticky top-0 z-40 backdrop-blur-lg bg-surface-light/70 dark:bg-surface-dark/70 border-b border-white/30 dark:border-white/5">
      <div className="mx-auto max-w-md md:max-w-4xl px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <VLiteLogo size={34} />
          <VLiteWordmark size="text-lg" />
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              className="px-3 py-2 rounded-xl text-sm font-medium text-ink-muted hover:text-ink-light dark:hover:text-ink-dark hover:bg-white/50 dark:hover:bg-white/5 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <NotificationBell />
          <WalletConnectButton />
        </div>
      </div>
    </header>
  );
}
