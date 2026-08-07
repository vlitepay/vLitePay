"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { Landmark, Plus, X } from "lucide-react";
import { useProfileStore } from "@/store/useProfileStore";
import { FIAT_CURRENCIES, FiatCode } from "@/lib/constants";

export function BankDetailsEditor() {
  const { address } = useAccount();
  const profile = useProfileStore((s) => s.getProfile(address));
  const addBankAccount = useProfileStore((s) => s.addBankAccount);
  const removeBankAccount = useProfileStore((s) => s.removeBankAccount);

  const [currency, setCurrency] = useState<FiatCode>(FIAT_CURRENCIES[0].code);
  const [bankName, setBankName] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [showForm, setShowForm] = useState(false);

  function handleAdd() {
    if (!address || !bankName || !accountName || !accountNumber) return;
    addBankAccount(address, { id: `${Date.now()}`, currency, bankName, accountName, accountNumber });
    setBankName("");
    setAccountName("");
    setAccountNumber("");
    setShowForm(false);
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-1.5">
          <Landmark size={14} className="text-vlite-gold" /> Bank details
        </h3>
        <button onClick={() => setShowForm((v) => !v)} className="text-xs font-medium text-vlite-purple dark:text-vlite-cyan">
          {showForm ? "Cancel" : "+ Add"}
        </button>
      </div>

      <p className="text-[11px] text-ink-muted">
        Used to speed up P2P trades with merchants — shared only when you choose to share it in a trade chat.
      </p>

      {profile.bankAccounts.length > 0 && (
        <div className="space-y-1.5">
          {profile.bankAccounts.map((b) => {
            const fiat = FIAT_CURRENCIES.find((f) => f.code === b.currency);
            return (
              <div key={b.id} className="rounded-xl bg-white/40 dark:bg-white/5 px-3 py-2.5 text-sm flex items-start justify-between">
                <div>
                  <p className="font-medium">
                    {fiat?.flag} {b.bankName} <span className="text-ink-muted font-normal">· {b.currency}</span>
                  </p>
                  <p className="text-xs text-ink-muted stat-mono">
                    {b.accountName} — {b.accountNumber}
                  </p>
                </div>
                <button onClick={() => address && removeBankAccount(address, b.id)} aria-label="Remove bank account">
                  <X size={13} className="text-ink-muted hover:text-danger" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showForm && (
        <div className="space-y-2 rounded-xl bg-white/40 dark:bg-white/5 p-3">
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value as FiatCode)}
            className="w-full rounded-xl px-3 py-2 bg-white/60 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
          >
            {FIAT_CURRENCIES.map((f) => (
              <option key={f.code} value={f.code}>
                {f.flag} {f.code} · {f.label}
              </option>
            ))}
          </select>
          <input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="Bank name"
            className="w-full rounded-xl px-3 py-2 bg-white/60 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
          />
          <input
            value={accountName}
            onChange={(e) => setAccountName(e.target.value)}
            placeholder="Account holder name"
            className="w-full rounded-xl px-3 py-2 bg-white/60 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
          />
          <input
            value={accountNumber}
            onChange={(e) => setAccountNumber(e.target.value)}
            placeholder="Account number / IBAN"
            className="w-full stat-mono rounded-xl px-3 py-2 bg-white/60 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
          />
          <button onClick={handleAdd} className="btn-vlite-primary w-full !py-2 text-sm flex items-center justify-center gap-1.5">
            <Plus size={14} /> Save bank account
          </button>
        </div>
      )}
    </div>
  );
}
