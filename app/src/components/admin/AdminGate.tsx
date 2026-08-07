"use client";

import { ReactNode } from "react";
import { useAccount } from "wagmi";
import { ShieldAlert } from "lucide-react";
import { useAdminRole } from "@/hooks/useAdminRole";

export function AdminGate({ children, requireOwner = false }: { children: ReactNode; requireOwner?: boolean }) {
  const { isConnected } = useAccount();
  const { isOwner, canAccessAdmin, isLoading } = useAdminRole();

  if (!isConnected) {
    return (
      <div className="glass-panel p-8 text-center space-y-2 mt-4">
        <ShieldAlert className="mx-auto text-ink-muted" size={26} />
        <p className="text-sm text-ink-muted">Connect the owner or arbiter wallet to access this panel.</p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="glass-panel h-40 animate-pulse bg-white/40 dark:bg-white/5 mt-4" />;
  }

  const allowed = requireOwner ? isOwner : canAccessAdmin;

  if (!allowed) {
    return (
      <div className="glass-panel p-8 text-center space-y-2 mt-4">
        <ShieldAlert className="mx-auto text-danger" size={26} />
        <p className="text-sm font-medium">Restricted</p>
        <p className="text-xs text-ink-muted">This wallet doesn't have {requireOwner ? "owner" : "admin"} access.</p>
      </div>
    );
  }

  return <>{children}</>;
}
