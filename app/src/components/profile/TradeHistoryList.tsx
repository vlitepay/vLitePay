"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { formatUnits } from "viem";
import { History, ArrowDownLeft, ArrowUpRight, Send, Smartphone } from "lucide-react";
import clsx from "clsx";
import { useTradeHistory } from "@/hooks/useTradeHistory";
import { useNotificationStore } from "@/store/useNotificationStore";
import { TOKENS } from "@/lib/constants";
import { formatTokenAmount } from "@/lib/utils";
import { TradeStatus } from "@/lib/types/p2p";

const STATUS_LABEL: Record<TradeStatus, string> = {
  [TradeStatus.Locked]: "In escrow",
  [TradeStatus.FiatMarked]: "Fiat sent",
  [TradeStatus.Released]: "Completed",
  [TradeStatus.Disputed]: "Disputed",
  [TradeStatus.Resolved]: "Resolved",
  [TradeStatus.Cancelled]: "Cancelled",
};

const STATUS_COLOR: Record<TradeStatus, string> = {
  [TradeStatus.Locked]: "text-vlite-cyan",
  [TradeStatus.FiatMarked]: "text-vlite-gold",
  [TradeStatus.Released]: "text-success",
  [TradeStatus.Disputed]: "text-warning",
  [TradeStatus.Resolved]: "text-ink-muted",
  [TradeStatus.Cancelled]: "text-danger",
};

type HistoryFilter = "all" | "p2p" | "transfer" | "topup";

const FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "p2p", label: "P2P" },
  { key: "transfer", label: "Transfer" },
  { key: "topup", label: "Top-up" },
];

interface HistoryItem {
  key: string;
  type: "p2p" | "transfer" | "topup";
  timestamp: number;
  href?: string;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  statusLabel: string;
  statusColor: string;
}

export function TradeHistoryList() {
  const { address } = useAccount();
  const { trades, isLoading } = useTradeHistory(address);
  const notifications = useNotificationStore((s) => s.notifications);
  const [filter, setFilter] = useState<HistoryFilter>("all");

  const p2pItems: HistoryItem[] = useMemo(() => {
    if (!address) return [];
    return trades.map((t) => {
      const token = TOKENS[t.tokenSymbol];
      const isBuyer = t.cryptoBuyer.toLowerCase() === address.toLowerCase();
      return {
        key: `p2p-${t.id.toString()}`,
        type: "p2p" as const,
        timestamp: Number(t.lockedAt) * 1000,
        href: `/p2p/trade/${t.id}`,
        icon: isBuyer ? <ArrowDownLeft size={14} className="text-success" /> : <ArrowUpRight size={14} className="text-vlite-purple" />,
        iconBg: isBuyer ? "bg-success/15" : "bg-vlite-purple/15",
        title: `${isBuyer ? "Bought" : "Sold"} ${formatTokenAmount(Number(formatUnits(t.amount, token.decimals)), t.tokenSymbol)} ${t.tokenSymbol}`,
        subtitle: `${(Number(t.fiatAmount) / 100).toLocaleString()} ${t.fiatCurrency}`,
        statusLabel: STATUS_LABEL[t.status],
        statusColor: STATUS_COLOR[t.status],
      };
    });
  }, [trades, address]);

  const transferItems: HistoryItem[] = useMemo(
    () =>
      notifications
        .filter((n) => n.category === "send")
        .map((n) => ({
          key: `transfer-${n.id}`,
          type: "transfer" as const,
          timestamp: n.timestamp,
          href: n.href,
          icon: <Send size={14} className="text-vlite-cyan" />,
          iconBg: "bg-vlite-cyan/15",
          title: n.title,
          subtitle: n.message,
          statusLabel: "Sent",
          statusColor: "text-success",
        })),
    [notifications]
  );

  const topupItems: HistoryItem[] = useMemo(
    () =>
      notifications
        .filter((n) => n.category === "airtime")
        .map((n) => ({
          key: `topup-${n.id}`,
          type: "topup" as const,
          timestamp: n.timestamp,
          href: n.href,
          icon: <Smartphone size={14} className="text-vlite-gold" />,
          iconBg: "bg-vlite-gold/15",
          title: n.title,
          subtitle: n.message,
          statusLabel: "Completed",
          statusColor: "text-success",
        })),
    [notifications]
  );

  const items = useMemo(() => {
    const all = [...p2pItems, ...transferItems, ...topupItems].sort((a, b) => b.timestamp - a.timestamp);
    if (filter === "all") return all;
    return all.filter((i) => i.type === filter);
  }, [p2pItems, transferItems, topupItems, filter]);

  if (!address) return null;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold flex items-center gap-1.5 px-1">
        <History size={14} className="text-vlite-purple" /> Trade history
      </h3>

      <div className="glass-panel-flush rounded-2xl p-1 flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={clsx(
              "flex-1 rounded-xl py-2 text-xs font-semibold transition-colors",
              filter === f.key ? "bg-vlite-gradient text-white shadow-glow" : "text-ink-muted"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="glass-panel h-20 animate-pulse bg-white/40 dark:bg-white/5" />
      ) : items.length === 0 ? (
        <div className="glass-panel p-5 text-center text-sm text-ink-muted">No activity yet — your history will show up here.</div>
      ) : (
        <div className="space-y-1.5">
          {items.map((item) => (
            <Link
              key={item.key}
              href={item.href ?? "/profile"}
              className="glass-panel flex items-center justify-between p-3.5 hover:-translate-y-0.5 transition-transform block"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${item.iconBg}`}>{item.icon}</div>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{item.title}</p>
                  <p className="text-xs text-ink-muted truncate">{item.subtitle}</p>
                </div>
              </div>
              <span className={`text-xs font-medium shrink-0 pl-2 ${item.statusColor}`}>{item.statusLabel}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
