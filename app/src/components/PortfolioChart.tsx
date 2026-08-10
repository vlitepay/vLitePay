"use client";

import { useMemo, useState } from "react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  XAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { motion } from "framer-motion";
import clsx from "clsx";
import { Eye, EyeOff } from "lucide-react";
import { TOKENS, TokenSymbol } from "@/lib/constants";

interface PortfolioChartProps {
  totalUsd: number;
  balances: Record<TokenSymbol, number>;
  prices: Record<TokenSymbol, number>;
  history: { "7d": { timestamp: number; valueUsd: number }[]; "30d": { timestamp: number; valueUsd: number }[] };
  hidden: boolean;
  onToggleHidden: () => void;
}

function formatUsd(v: number) {
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="glass-panel px-3 py-2 text-xs">
      <div className="text-ink-muted">{new Date(point.timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</div>
      <div className="stat-mono font-semibold">{formatUsd(point.valueUsd)}</div>
    </div>
  );
}

export function PortfolioChart({ totalUsd, balances, prices, history, hidden, onToggleHidden }: PortfolioChartProps) {
  const [range, setRange] = useState<"7d" | "30d">("7d");
  const [hoverToken, setHoverToken] = useState<TokenSymbol | null>(null);

  const allocation = useMemo(() => {
    return (Object.keys(TOKENS) as TokenSymbol[])
      .map((symbol) => {
        const usdValue = balances[symbol] * prices[symbol];
        return { symbol, usdValue, color: TOKENS[symbol].color };
      })
      .filter((a) => a.usdValue > 0);
  }, [balances, prices]);

  const data = history[range];
  // A flat fallback line (used when there isn't enough real history yet —
  // see app/page.tsx) has an identical first and last value, which reads as
  // "flat", not "down" — treated as its own neutral state below rather than
  // defaulting to red the way a plain boolean comparison used to.
  const first = data[0]?.valueUsd ?? totalUsd;
  const last = data[data.length - 1]?.valueUsd ?? totalUsd;
  const changeUsd = last - first;
  const trend: "up" | "down" | "flat" = Math.abs(changeUsd) < 0.005 ? "flat" : changeUsd > 0 ? "up" : "down";

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.15, ease: "easeOut" } }}
      whileTap={{ scale: 0.995, transition: { duration: 0.1 } }}
      className="glass-panel relative overflow-hidden p-5 md:p-6 transition-shadow duration-200 hover:shadow-card dark:hover:shadow-card-dark"
    >
      <div className="vlite-halo -top-24 -right-24 h-56 w-56 rounded-full" aria-hidden />

      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-sm text-ink-muted flex items-center gap-1.5">
            Total portfolio value
            <button
              onClick={onToggleHidden}
              aria-label={hidden ? "Show portfolio value" : "Hide portfolio value"}
              className="text-ink-muted hover:text-ink-light dark:hover:text-ink-dark transition-colors"
            >
              {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </p>
          <p className="stat-mono text-3xl md:text-4xl font-bold mt-1">{hidden ? "••••••" : formatUsd(totalUsd)}</p>
          {!hidden && (
            <p
              className={clsx(
                "text-xs font-medium mt-1",
                trend === "up" ? "text-success" : trend === "down" ? "text-danger" : "text-ink-muted"
              )}
            >
              {trend === "up" ? "▲" : trend === "down" ? "▼" : "•"} {range === "7d" ? "past 7 days" : "past 30 days"}
            </p>
          )}
        </div>

        <div className="flex gap-1 glass-panel-flush rounded-full p-1">
          {(["7d", "30d"] as const).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={clsx(
                "px-3 py-1.5 rounded-full text-xs font-semibold transition-colors",
                range === r ? "bg-vlite-gradient text-white shadow-glow" : "text-ink-muted hover:text-ink-light dark:hover:text-ink-dark"
              )}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      <div className={clsx("relative h-36 mt-4 -mx-2 transition-[filter] duration-200", hidden && "blur-md select-none")}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="vlitePayAreaFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.45} />
                <stop offset="100%" stopColor="#7C3AED" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <XAxis dataKey="timestamp" hide />
            {!hidden && <Tooltip content={<CustomTooltip />} />}
            <Area
              type="monotone"
              dataKey="valueUsd"
              stroke="#6366F1"
              strokeWidth={2.5}
              fill="url(#vlitePayAreaFill)"
              animationDuration={700}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="relative flex items-center gap-6 mt-2">
        <div className={clsx("h-28 w-28 shrink-0 transition-[filter] duration-200", hidden && "blur-md select-none")}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={allocation}
                dataKey="usdValue"
                nameKey="symbol"
                innerRadius={32}
                outerRadius={52}
                paddingAngle={3}
                animationDuration={700}
                onMouseEnter={(_, i) => setHoverToken(allocation[i]?.symbol ?? null)}
                onMouseLeave={() => setHoverToken(null)}
              >
                {allocation.map((entry) => (
                  <Cell
                    key={entry.symbol}
                    fill={entry.color}
                    opacity={hoverToken && hoverToken !== entry.symbol ? 0.35 : 1}
                    stroke="none"
                  />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="flex-1 space-y-1.5">
          {allocation.map((a) => {
            const pct = totalUsd > 0 ? (a.usdValue / totalUsd) * 100 : 0;
            return (
              <div
                key={a.symbol}
                className="flex items-center justify-between text-sm"
                onMouseEnter={() => setHoverToken(a.symbol)}
                onMouseLeave={() => setHoverToken(null)}
              >
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: a.color }} />
                  {a.symbol}
                </span>
                <span className="stat-mono text-ink-muted">{pct.toFixed(1)}%</span>
              </div>
            );
          })}
          {allocation.length === 0 && <p className="text-sm text-ink-muted">No balances yet — deposit to get started.</p>}
        </div>
      </div>
    </motion.div>
  );
}
