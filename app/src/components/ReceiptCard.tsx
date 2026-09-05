"use client";

import { motion } from "framer-motion";
import { AlertOctagon, CheckCircle2, ExternalLink, Loader2, Share2 } from "lucide-react";
import { shareReceipt } from "@/lib/share";

export type ReceiptStatus = "pending" | "success" | "failed";

export interface ReceiptRow {
  label: string;
  value: string;
  /** Monospace styling — use for hashes, addresses, transaction IDs. */
  mono?: boolean;
}

export interface ReceiptCardProps {
  status: ReceiptStatus;
  title: string;
  subtitle?: string;
  rows?: ReceiptRow[];
  explorerUrl?: string;
  explorerLabel?: string;
  /** Secondary explorer link — e.g. CCTP's destination-chain explorer, shown smaller/below the primary one. */
  secondaryExplorerUrl?: string;
  secondaryExplorerLabel?: string;
  shareTitle?: string;
  shareText?: string;
  shareUrl?: string;
  /** Extra note shown below the rows — e.g. airtime's "your payment will be refunded" clarity on failure. */
  footerNote?: string;
  onDone?: () => void;
  doneLabel?: string;
}

/**
 * One shared success/receipt card for Top Up, Send, Swap, and CCTP so all
 * four flows look and behave consistently. Screenshot-friendly by design:
 * a single self-contained, generously-spaced card with no interactive
 * chrome that would look broken in a still image.
 *
 * `status` drives the icon deliberately — pending ALWAYS shows a spinner,
 * never a checkmark. A lone green check while something is still
 * processing is exactly the bug this card exists to prevent (see Top Up's
 * Reloadly-status polling, which keeps `status="pending"` until Reloadly
 * actually confirms).
 */
export function ReceiptCard({
  status,
  title,
  subtitle,
  rows = [],
  explorerUrl,
  explorerLabel = "View on Arc Explorer",
  secondaryExplorerUrl,
  secondaryExplorerLabel = "View destination transaction",
  shareTitle,
  shareText,
  shareUrl,
  footerNote,
  onDone,
  doneLabel = "Done",
}: ReceiptCardProps) {
  const canShare = !!(shareText || shareUrl);

  async function handleShare() {
    if (!canShare) return;
    await shareReceipt({ title: shareTitle ?? title, text: shareText ?? title, url: shareUrl });
  }

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-8 text-center space-y-4">
      <div>
        {status === "pending" && <Loader2 className="mx-auto animate-spin text-vlite-cyan" size={36} />}
        {status === "success" && <CheckCircle2 className="mx-auto text-success" size={36} />}
        {status === "failed" && <AlertOctagon className="mx-auto text-danger" size={36} />}
      </div>

      <div className="space-y-1">
        <h2 className="font-display text-lg font-semibold">{title}</h2>
        {subtitle && <p className="text-sm text-ink-muted max-w-xs mx-auto">{subtitle}</p>}
      </div>

      {rows.length > 0 && (
        <div className="rounded-2xl bg-white/40 dark:bg-white/5 p-3 text-sm space-y-1.5 text-left">
          {rows.map((row, i) => (
            <div className="flex justify-between gap-3" key={i}>
              <span className="text-ink-muted shrink-0">{row.label}</span>
              <span className={"text-right" + (row.mono ? " stat-mono break-all" : " font-medium")}>{row.value}</span>
            </div>
          ))}
        </div>
      )}

      {footerNote && <p className="text-xs text-ink-muted max-w-xs mx-auto">{footerNote}</p>}

      {(explorerUrl || canShare) && (
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-vlite-purple hover:underline"
            >
              {explorerLabel} <ExternalLink size={14} />
            </a>
          )}
          {canShare && (
            <button onClick={handleShare} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-muted hover:text-vlite-purple">
              Share <Share2 size={14} />
            </button>
          )}
        </div>
      )}

      {secondaryExplorerUrl && (
        <a
          href={secondaryExplorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-vlite-purple"
        >
          {secondaryExplorerLabel} <ExternalLink size={12} />
        </a>
      )}

      {onDone && (
        <button onClick={onDone} className="btn-vlite-secondary mx-auto !py-2 text-sm">
          {doneLabel}
        </button>
      )}
    </motion.div>
  );
}
