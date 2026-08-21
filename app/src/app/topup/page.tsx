"use client";

import { useEffect, useMemo, useState } from "react";
import { parseUnits } from "viem";
import { useAccount } from "wagmi";
import { motion } from "framer-motion";
import { Smartphone, CheckCircle2 } from "lucide-react";
import clsx from "clsx";
import { AIRTIME_COUNTRIES, TOKENS, TokenSymbol } from "@/lib/constants";
import { formatTokenAmount } from "@/lib/utils";
import { useTokenBalances } from "@/hooks/useTokenBalances";
import { useExchangeRates } from "@/hooks/useExchangeRates";
import { useAirtimeFee } from "@/hooks/useAirtimeFee";
import { useAirtimePurchase } from "@/hooks/useAirtimePurchase";
import { useReloadlyOperators } from "@/hooks/useReloadlyOperators";
import { ReloadlyOperator } from "@/lib/types/reloadly";
import { AirtimeDataToggle } from "@/components/airtime/AirtimeDataToggle";
import { OperatorSelector } from "@/components/airtime/OperatorSelector";
import { PackageGrid } from "@/components/airtime/PackageGrid";
import { TokenIcon } from "@/components/TokenIcon";
import { RecentSuggestions } from "@/components/shared/RecentSuggestions";
import { useRecentHistoryStore } from "@/store/useRecentHistoryStore";
import { notify } from "@/lib/notify";
import { useVLiteStore } from "@/store/useVLiteStore";

const PAYABLE_TOKENS: TokenSymbol[] = ["USDC", "EURC"];

export default function TopUpPage() {
  const { address } = useAccount();
  const { balances } = useTokenBalances();
  const { rates } = useExchangeRates();
  const { feeBps } = useAirtimeFee();
  const { purchase, busy, error, step } = useAirtimePurchase();
  const markFirstActionComplete = useVLiteStore((s) => s.markFirstActionComplete);
  const addRecentPhone = useRecentHistoryStore((s) => s.addRecent);
  const recentPhones = useRecentHistoryStore((s) => s.getRecent("topup-phone", address));

  const [country, setCountry] = useState<string>(AIRTIME_COUNTRIES[0].code);
  const [mode, setMode] = useState<"airtime" | "data">("airtime");
  const [phone, setPhone] = useState("");
  const [selectedOperator, setSelectedOperator] = useState<ReloadlyOperator | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [token, setToken] = useState<TokenSymbol>("USDC");
  const [done, setDone] = useState<string | null>(null);

  const { operators, loading: operatorsLoading, error: operatorsError } = useReloadlyOperators(country);

  const filteredOperators = useMemo(
    () => operators.filter((op) => (mode === "data" ? op.data : !op.data)),
    [operators, mode]
  );

  // Reset downstream selections whenever their upstream input changes.
  useEffect(() => {
    setSelectedOperator(null);
    setAmount(null);
  }, [country, mode]);

  // Notify on purchase failure — driven by the hook's own error state rather
  // than a value captured inside handleSubmit's closure, so it always reflects
  // the latest attempt.
  useEffect(() => {
    if (error) {
      notify({
        category: "airtime",
        title: `${mode === "data" ? "Data" : "Airtime"} top-up failed`,
        message: error,
        href: "/topup",
      });
    }
  }, [error]);

  useEffect(() => {
    setAmount(null);
  }, [selectedOperator?.id]);

  const numericUsd = amount ?? 0;
  const fee = numericUsd * (feeBps / 10_000);
  const totalUsd = numericUsd + fee;
  const tokenPrice = rates.crypto[token];
  const totalTokenAmount = tokenPrice > 0 ? totalUsd / tokenPrice : 0;

  const valid = !!selectedOperator && numericUsd > 0 && phone.length >= 6 && totalTokenAmount <= (balances[token] ?? 0);

  async function handleSubmit() {
    if (!selectedOperator) return;
    const tokenUnits = parseUnits(totalTokenAmount.toFixed(TOKENS[token].decimals), TOKENS[token].decimals);
    const result = await purchase({
      tokenSymbol: token,
      tokenAmount: tokenUnits,
      operatorId: selectedOperator.id,
      amount: numericUsd,
      recipientPhone: phone,
      recipientCountryCode: country,
    });
    if (result) {
      setDone(result.hash);
      markFirstActionComplete();
      addRecentPhone("topup-phone", address, phone);
      notify({
        category: "airtime",
        title: `${mode === "data" ? "Data" : "Airtime"} top-up submitted`,
        message: `$${numericUsd.toFixed(2)} to ${phone} via ${selectedOperator.name} is confirmed on-chain and sent to the provider.`,
        href: "/topup",
      });
    }
  }

  if (done) {
    return (
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass-panel p-8 text-center space-y-3 mt-4">
        <CheckCircle2 className="mx-auto text-success" size={32} />
        <h1 className="font-display text-xl font-semibold">Top-up submitted!</h1>
        <p className="text-sm text-ink-muted max-w-xs mx-auto">
          Your payment is confirmed on-chain and the {mode} request has been sent to {selectedOperator?.name}.
        </p>
        <p className="text-xs stat-mono text-ink-muted break-all">{done}</p>
        <button
          onClick={() => {
            setDone(null);
            setAmount(null);
          }}
          className="btn-vlite-secondary mx-auto !py-2 text-sm"
        >
          Send another top-up
        </button>
      </motion.div>
    );
  }

  return (
    <div className="space-y-4 animate-slide-up">
      <h1 className="font-display text-xl font-semibold flex items-center gap-2">
        <Smartphone size={20} className="text-vlite-gold" /> Airtime &amp; Data
      </h1>

      <div className="glass-panel p-5 space-y-4">
        <div>
          <label className="text-xs text-ink-muted">Country</label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full mt-1 rounded-xl px-3 py-2.5 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
          >
            {AIRTIME_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.flag} {c.label}
              </option>
            ))}
          </select>
        </div>

        <AirtimeDataToggle value={mode} onChange={setMode} />

        <div>
          <label className="text-xs text-ink-muted mb-1.5 block">Network operator</label>
          <OperatorSelector
            operators={filteredOperators}
            loading={operatorsLoading}
            error={operatorsError}
            selectedId={selectedOperator?.id ?? null}
            onSelect={setSelectedOperator}
          />
        </div>

        <div>
          <label className="text-xs text-ink-muted">Phone number</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+234 801 234 5678"
            className="w-full mt-1 stat-mono rounded-xl px-3 py-2.5 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
          />
          <RecentSuggestions values={recentPhones} onSelect={setPhone} />
        </div>

        <div>
          <label className="text-xs text-ink-muted mb-1.5 block">{mode === "data" ? "Data package" : "Amount"}</label>
          <PackageGrid
            key={selectedOperator?.id ?? "none"}
            operator={selectedOperator}
            selectedAmount={amount}
            onSelect={setAmount}
            token={token}
            tokenPrice={tokenPrice}
            feeBps={feeBps}
          />
        </div>

        <div>
          <label className="text-xs text-ink-muted mb-1.5 block">Pay with</label>
          <div className="grid grid-cols-2 gap-2">
            {PAYABLE_TOKENS.map((t) => (
              <button
                key={t}
                onClick={() => setToken(t)}
                className={clsx(
                  "rounded-xl py-2.5 text-sm font-semibold transition-colors flex items-center justify-center gap-1.5",
                  token === t ? "bg-vlite-gradient text-white shadow-glow" : "glass-panel-flush text-ink-muted"
                )}
              >
                <TokenIcon symbol={t} size={16} />
                {t}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl bg-white/40 dark:bg-white/5 p-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-ink-muted">{mode === "data" ? "Package amount" : "Top-up amount"}</span>
            <span className="stat-mono">${numericUsd.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-ink-muted">Fee ({(feeBps / 100).toFixed(2)}%)</span>
            <span className="stat-mono">${fee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold border-t border-white/15 dark:border-white/5 pt-1.5">
            <span>Total charged</span>
            <span className="stat-mono">{formatTokenAmount(totalTokenAmount, token)} {token}</span>
          </div>
          <p className="text-xs text-ink-muted">Your {token} balance: {formatTokenAmount(balances[token] ?? 0, token)}</p>
        </div>

        {error && <p className="text-sm text-danger">{error}</p>}

        <button onClick={handleSubmit} disabled={!valid || busy} className="btn-vlite-primary w-full">
          {busy ? (step === "paying" ? "Confirming payment…" : "Contacting provider…") : mode === "data" ? "Buy data" : "Buy airtime"}
        </button>
      </div>

      <p className="text-[11px] text-ink-muted text-center px-6">
        Sandbox mode — no real airtime or data is delivered on Arc Testnet.
      </p>
    </div>
  );
}
