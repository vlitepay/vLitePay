"use client";

import { useEffect, useMemo } from "react";
import { PortfolioChart } from "@/components/PortfolioChart";
import { GetStartedCard } from "@/components/GetStartedCard";
import { BalanceList } from "@/components/BalanceList";
import { QuickActions } from "@/components/QuickActions";
import { ActivityFeed } from "@/components/ActivityFeed";
import { PullToRefresh } from "@/components/PullToRefresh";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { useVLiteStore } from "@/store/useVLiteStore";
import { TokenSymbol } from "@/lib/constants";

const DAY_MS = 86_400_000;
// Don't append a new history point more than once every 30 minutes — the
// user having the app open shouldn't spam the stored series; instead the
// most recent point just gets updated in place until this interval passes.
const MIN_SNAPSHOT_INTERVAL_MS = 30 * 60 * 1000;

export default function HomePage() {
  const { balances, statuses, isConnected, refetch: refetchBalances } = useTokenBalances();
  const { rates, refetch: refetchRates } = useExchangeRates();
  const portfolioHistory = useVLiteStore((s) => s.portfolioHistory);
  const setPortfolioHistory = useVLiteStore((s) => s.setPortfolioHistory);
  const portfolioHidden = useVLiteStore((s) => s.portfolioHidden);
  const togglePortfolioHidden = useVLiteStore((s) => s.togglePortfolioHidden);

  async function handleRefresh() {
    await Promise.all([refetchBalances(), refetchRates()]);
  }

  const prices: Record<TokenSymbol, number> = {
    USDC: rates.crypto.USDC,
    EURC: rates.crypto.EURC,
    cirBTC: rates.crypto.cirBTC,
  };

  const totalUsd = useMemo(
    () => (Object.keys(balances) as TokenSymbol[]).reduce((sum, s) => sum + balances[s] * prices[s], 0),
    [balances, prices]
  );

  // Records a REAL snapshot of the portfolio's total value each time it's
  // known, rather than synthesizing a plausible-looking trend line — this
  // used to be a deterministic sine-wave generator that had no relationship
  // to the actual portfolio at all, which is why the trend arrow could show
  // red even while the balance was rising. Snapshots persist in
  // useVLiteStore (see partialize there) and accumulate into real 7d/30d
  // history over time.
  useEffect(() => {
    if (totalUsd <= 0) return; // don't record while balances haven't loaded yet — that would record a false zero
    const now = Date.now();

    (["7d", "30d"] as const).forEach((range) => {
      const days = range === "7d" ? 7 : 30;
      const cutoff = now - days * DAY_MS;
      const pruned = portfolioHistory[range].filter((p) => p.timestamp >= cutoff);
      const last = pruned[pruned.length - 1];

      if (last && now - last.timestamp < MIN_SNAPSHOT_INTERVAL_MS) {
        setPortfolioHistory(range, [...pruned.slice(0, -1), { timestamp: now, valueUsd: totalUsd }]);
      } else {
        setPortfolioHistory(range, [...pruned, { timestamp: now, valueUsd: totalUsd }]);
      }
    });
    // Deliberately excludes portfolioHistory/setPortfolioHistory — this
    // should only re-run when the portfolio's actual value changes, not
    // every time it writes its own update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalUsd]);

  // Until enough real snapshots have accumulated, show an honest flat line
  // at the current value instead of a fabricated up/down shape — no fake
  // movement, and the trend indicator (computed in PortfolioChart from
  // first vs last point) naturally reads as neutral for a flat line rather
  // than defaulting to a misleading red.
  const history = useMemo(() => {
    const withFallback = (points: typeof portfolioHistory["7d"], days: number) => {
      if (points.length >= 2) return points;
      const now = Date.now();
      return [
        { timestamp: now - days * DAY_MS, valueUsd: totalUsd },
        { timestamp: now, valueUsd: totalUsd },
      ];
    };
    return {
      "7d": withFallback(portfolioHistory["7d"], 7),
      "30d": withFallback(portfolioHistory["30d"], 30),
    };
  }, [portfolioHistory, totalUsd]);

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-5 animate-slide-up">
        {!isConnected && (
          <div className="glass-panel px-4 py-3 text-sm text-ink-muted text-center">
            Connect your wallet or sign in with email to see live balances.
          </div>
        )}

        <PortfolioChart
          totalUsd={totalUsd}
          balances={balances}
          prices={prices}
          history={history}
          hidden={portfolioHidden}
          onToggleHidden={togglePortfolioHidden}
        />

        <GetStartedCard />

        <QuickActions />

        <div>
          <h2 className="text-sm font-semibold text-ink-muted mb-2 px-1">Your assets</h2>
          <BalanceList balances={balances} prices={prices} statuses={statuses} hidden={portfolioHidden} />
        </div>

        <ActivityFeed />

        <p className="text-[11px] text-ink-muted text-center px-6 pb-2">
          vLitePay is a technology platform only. Users and merchants handle their own KYC/AML.
        </p>
      </div>
    </PullToRefresh>
  );
}
