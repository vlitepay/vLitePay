import Link from "next/link";
import { Users, Scale, Settings, ShieldCheck } from "lucide-react";
import { AdminGate } from "@/components/admin/AdminGate";

const SECTIONS = [
  { href: "/admin/merchants", label: "Merchant Management", desc: "Approve, reject, or restrict merchants", icon: Users },
  { href: "/admin/disputes", label: "Dispute Dashboard", desc: "Review evidence and resolve disputes", icon: Scale },
  { href: "/admin/settings", label: "Protocol Settings", desc: "Fees, timers, arbiters, supported pairs", icon: Settings },
];

export default function AdminPage() {
  return (
    <AdminGate>
      <div className="space-y-4 animate-slide-up">
        <h1 className="font-display text-xl font-semibold flex items-center gap-2">
          <ShieldCheck size={20} className="text-vlite-purple" /> Admin
        </h1>
        <div className="space-y-2.5">
          {SECTIONS.map((s) => (
            <Link key={s.href} href={s.href} className="glass-panel flex items-center gap-3 p-4 hover:-translate-y-0.5 transition-transform block">
              <div className="h-11 w-11 rounded-2xl bg-vlite-gradient flex items-center justify-center text-white shrink-0">
                <s.icon size={19} />
              </div>
              <div>
                <p className="font-medium text-sm">{s.label}</p>
                <p className="text-xs text-ink-muted">{s.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </AdminGate>
  );
}
