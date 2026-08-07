"use client";

import { useMemo } from "react";
import { PortfolioChart } from "@/components/PortfolioChart";
import { GetStartedCard } from "@/components/GetStartedCard";
import { BalanceList } from "@/components/BalanceList";
import { QuickActions } from "@/components/QuickActions";
import { ActivityFeed } from "@/components/ActivityFeed";
import { PullToRefresh } from "@/components/PullToRefresh";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { TokenSymbol } from "@/lib/constants";

// Deterministic placeholder trend generator — replaced by real on-chain/
// indexed history in a later pass once balance snapshots are recorded.
function buildHistory(currentTotal: number, days: number) {
  const points = [];
  const now = Date.now();
  let seed = currentTotal || 1000;
  for (let i = days; i >= 0; i--) {
    seed = seed + Math.sin(i * 1.3) * (currentTotal * 0.015 || 8) - (currentTotal * 0.002 || 1);
    points.push({ timestamp: now - i * 86_400_000, valueUsd: Math.max(seed, 0) });
  }
  if (points.length) points[points.length - 1].valueUsd = currentTotal;
  return points;
}

export default function HomePage() {
  const { balances, statuses, isConnected, refetch: refetchBalances } = useTokenBalances();
  const { rates, refetch: refetchRates } = useExchangeRates();

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

  const history = useMemo(
    () => ({ "7d": buildHistory(totalUsd, 7), "30d": buildHistory(totalUsd, 30) }),
    [totalUsd]
  );

  return (
    <PullToRefresh onRefresh={handleRefresh}>
      <div className="space-y-5 animate-slide-up">
        {!isConnected && (
          <div className="glass-panel px-4 py-3 text-sm text-ink-muted text-center">
            Connect your wallet or sign in with email to see live balances.
          </div>
        )}

        <PortfolioChart totalUsd={totalUsd} balances={balances} prices={prices} history={history} />

        <GetStartedCard />

        <QuickActions />

        <div>
          <h2 className="text-sm font-semibold text-ink-muted mb-2 px-1">Your assets</h2>
          <BalanceList balances={balances} prices={prices} statuses={statuses} />
        </div>

        <ActivityFeed />

        <p className="text-[11px] text-ink-muted text-center px-6 pb-2">
          vLitePay is a technology platform only. Users and merchants handle their own KYC/AML.
        </p>
      </div>
    </PullToRefresh>
  );
}
