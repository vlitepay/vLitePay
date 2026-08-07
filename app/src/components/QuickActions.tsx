import Link from "next/link";
import { Send, QrCode, Repeat, Smartphone } from "lucide-react";

const ACTIONS = [
  { label: "Transfer", href: "/transfer", icon: Send },
  { label: "Deposit", href: "/transfer?tab=deposit", icon: QrCode },
  { label: "P2P Trade", href: "/p2p", icon: Repeat, highlight: true },
  { label: "Top Up", href: "/topup", icon: Smartphone },
];

export function QuickActions() {
  return (
    <div className="grid grid-cols-4 gap-3">
      {ACTIONS.map((action) => (
        <Link
          key={action.label}
          href={action.href}
          className="group glass-panel flex flex-col items-center gap-2 py-4 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:shadow-card dark:hover:shadow-card-dark active:scale-95 active:brightness-95"
        >
          <div
            className={
              action.highlight
                ? "h-11 w-11 rounded-2xl bg-vlite-gradient flex items-center justify-center text-white shadow-glow transition-transform duration-150 group-hover:scale-110 group-active:scale-95"
                : "h-11 w-11 rounded-2xl glass-panel-flush flex items-center justify-center transition-transform duration-150 group-hover:scale-110 group-active:scale-95"
            }
          >
            <action.icon size={19} />
          </div>
          <span className="text-xs font-medium text-center leading-tight">{action.label}</span>
        </Link>
      ))}
    </div>
  );
}
