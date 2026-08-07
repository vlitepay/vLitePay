"use client";

import clsx from "clsx";
import { useCountdown } from "@/hooks/useCountdown";

export function TradeTimer({ secondsLeft, totalSeconds }: { secondsLeft: number; totalSeconds: number }) {
  const { label, expired } = useCountdown(secondsLeft);
  const pct = totalSeconds > 0 ? Math.max(0, Math.min(1, secondsLeft / totalSeconds)) : 0;
  const urgent = pct < 0.15 && !expired;

  const radius = 26;
  const circumference = 2 * Math.PI * radius;

  return (
    <div className="glass-panel p-4 flex items-center gap-4">
      <div className="relative h-16 w-16 shrink-0">
        <svg viewBox="0 0 64 64" className="h-16 w-16 -rotate-90">
          <circle cx="32" cy="32" r={radius} fill="none" stroke="currentColor" strokeWidth="5" className="text-white/15" />
          <circle
            cx="32"
            cy="32"
            r={radius}
            fill="none"
            stroke="url(#timerGradient)"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - pct)}
            className="transition-all duration-1000 ease-linear"
          />
          <defs>
            <linearGradient id="timerGradient" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={urgent ? "#F43F5E" : "#22D3EE"} />
              <stop offset="100%" stopColor={urgent ? "#F43F5E" : "#7C3AED"} />
            </linearGradient>
          </defs>
        </svg>
      </div>
      <div>
        <p className="text-xs text-ink-muted">{expired ? "Window expired" : "Time remaining"}</p>
        <p className={clsx("stat-mono text-xl font-bold", urgent && "text-danger")}>{label}</p>
      </div>
    </div>
  );
}
