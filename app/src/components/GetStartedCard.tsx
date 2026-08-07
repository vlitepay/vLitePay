"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Send, Smartphone } from "lucide-react";
import { useVLiteStore } from "@/store/useVLiteStore";

/**
 * Shown on Home only until the user completes their first successful
 * transaction (Send, Top-up, or P2P trade release). Hidden permanently
 * once useVLiteStore.hasCompletedFirstAction flips to true.
 */
export function GetStartedCard() {
  const hasCompletedFirstAction = useVLiteStore((s) => s.hasCompletedFirstAction);

  if (hasCompletedFirstAction) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass-panel p-4 space-y-3"
    >
      <div>
        <h2 className="font-display text-base font-semibold">Get started</h2>
        <p className="text-sm text-ink-muted">Complete your first action</p>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <Link href="/transfer" className="btn-vlite-primary !py-2.5 text-sm flex items-center justify-center gap-1.5">
          <Send size={15} />
          Transfer
        </Link>
        <Link href="/topup" className="btn-vlite-secondary !py-2.5 text-sm flex items-center justify-center gap-1.5">
          <Smartphone size={15} />
          Buy Airtime
        </Link>
      </div>
    </motion.div>
  );
}
