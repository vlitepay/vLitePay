"use client";

import { useState } from "react";
import clsx from "clsx";
import { ReloadlyOperator } from "@/lib/types/reloadly";
import { cleanPackageDescription, formatLocalAmount } from "@/lib/reloadlyFormat";
import { formatTokenAmount } from "@/lib/utils";
import { TokenSymbol } from "@/lib/constants";

/** Fee-inclusive token amount the user actually pays for a given USD-denominated package price. */
function tokenTotalFor(usdAmount: number, tokenPrice: number, feeBps: number): number {
  if (tokenPrice <= 0) return 0;
  const withFee = usdAmount * (1 + feeBps / 10_000);
  return withFee / tokenPrice;
}

export function PackageGrid({
  operator,
  selectedAmount,
  onSelect,
  token,
  tokenPrice,
  feeBps,
}: {
  operator: ReloadlyOperator | null;
  selectedAmount: number | null;
  onSelect: (amount: number | null) => void;
  /** Stablecoin the user is paying with, and its live USD price + the platform fee — used to show what each package actually costs in that token. */
  token: TokenSymbol;
  tokenPrice: number;
  feeBps: number;
}) {
  // Local text state for the RANGE custom-amount input, so partial input
  // like "10." can be typed without snapping back to "10" every keystroke.
  // Parent remounts this component (key={operator.id} in topup/page.tsx)
  // whenever the operator changes, which resets this back to "" for free.
  const [customValue, setCustomValue] = useState("");

  if (!operator) {
    return <p className="text-xs text-ink-muted">Select a network operator to see available packages.</p>;
  }

  const supportsCustomAmount = operator.denominationType === "RANGE";
  const hasFixedPackages = operator.denominationType === "FIXED" && operator.fixedAmounts?.length > 0;
  const localCode = operator.localCurrencyCode;

  function handleCustomChange(v: string) {
    setCustomValue(v);
    const num = Number(v);
    onSelect(num > 0 ? num : null);
  }

  return (
    <div className="space-y-2.5">
      {hasFixedPackages && (
        <div className="grid grid-cols-2 gap-2">
          {operator.fixedAmounts.map((usdAmount, i) => {
            const localAmount = operator.localFixedAmounts?.[i];
            const rawDescription =
              operator.fixedAmountsDescriptions?.[String(usdAmount)] ??
              (localAmount != null ? operator.localFixedAmountsDescriptions?.[String(localAmount)] : undefined);
            const description = rawDescription ? cleanPackageDescription(rawDescription) : null;

            const primaryPrice = localAmount != null && localCode ? formatLocalAmount(localAmount, localCode) : `$${usdAmount}`;
            const secondaryTokenAmount = tokenTotalFor(usdAmount, tokenPrice, feeBps);

            const active = selectedAmount === usdAmount;
            return (
              <button
                key={usdAmount}
                onClick={() => onSelect(usdAmount)}
                className={clsx(
                  "rounded-2xl p-3 flex flex-col items-start gap-1 text-left transition-colors",
                  active ? "bg-vlite-gradient text-white shadow-glow" : "glass-panel-flush"
                )}
              >
                <span className="stat-mono text-base font-bold">{primaryPrice}</span>
                <span className={clsx("stat-mono text-[11px]", active ? "text-white/80" : "text-ink-muted")}>
                  {formatTokenAmount(secondaryTokenAmount, token)} {token}
                </span>
                {description && (
                  <span className={clsx("text-[11px] leading-snug", active ? "text-white/90" : "text-ink-muted")}>
                    {description}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {!hasFixedPackages && !supportsCustomAmount && (
        <p className="text-xs text-ink-muted">No packages available for this operator right now.</p>
      )}

      {supportsCustomAmount ? (
        <div>
          <input
            type="number"
            value={customValue}
            onChange={(e) => handleCustomChange(e.target.value)}
            placeholder={operator.minAmount && operator.maxAmount ? `${operator.minAmount} – ${operator.maxAmount}` : "Enter amount"}
            className="w-full stat-mono rounded-xl px-3 py-2.5 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
          />
          {(operator.minAmount || operator.maxAmount) && (
            <p className="text-[11px] text-ink-muted mt-1">
              Limits:{" "}
              {operator.localMinAmount != null && localCode ? formatLocalAmount(operator.localMinAmount, localCode) : `$${operator.minAmount ?? 0}`}
              {" – "}
              {operator.localMaxAmount != null && localCode ? formatLocalAmount(operator.localMaxAmount, localCode) : `$${operator.maxAmount ?? "—"}`}
            </p>
          )}
        </div>
      ) : (
        hasFixedPackages && <p className="text-[11px] text-ink-muted px-1">Custom amount not available for this operator</p>
      )}
    </div>
  );
}
