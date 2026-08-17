"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useAccount } from "wagmi";
import { Paperclip, Send, Landmark, X } from "lucide-react";
import { useP2PStore } from "@/store/useP2PStore";
import { useProfileStore } from "@/store/useProfileStore";
import { ChatMessage } from "@/lib/types/p2p";
import { loadChatMessages, sendChatMessage } from "@/lib/chatClient";

/** How often to re-poll Supabase for new messages while the chat is open —
 * light polling per this step's scope, not realtime. */
const CHAT_POLL_INTERVAL_MS = 8_000;

/**
 * Mini-chat for a trade, now backed by Supabase (see lib/chatClient.ts,
 * app/api/chat/*) with local Zustand storage as the always-on fallback:
 *   - On mount and on a light poll, previous messages load from Supabase
 *     and replace the local list for this trade — but ONLY when the load
 *     succeeds and returns at least one message, or when there's no local
 *     history yet. A failed load, or an empty remote result while local
 *     history already exists, leaves local data exactly as it was — chat
 *     never appears to "lose" messages just because Supabase hiccupped.
 *   - Sending still adds the message to local state immediately
 *     (optimistic, same instant feedback as before) and separately
 *     persists it through the secure nonce -> sign -> POST flow. If that
 *     persist fails, the message stays visible locally (nothing
 *     disappears) but a clear inline error explains it wasn't saved to the
 *     cloud, per this step's explicit "don't pretend it succeeded" rule.
 */
export function TradeChat({ tradeId, myRole }: { tradeId: number; myRole: "buyer" | "seller" }) {
  const { address } = useAccount();
  const messages = useP2PStore((s) => s.messagesByTrade[tradeId] ?? []);
  const addMessage = useP2PStore((s) => s.addMessage);
  const setMessages = useP2PStore((s) => s.setMessages);
  const bankAccounts = useProfileStore((s) => s.getProfile(address).bankAccounts);
  const [text, setText] = useState("");
  const [showBankPicker, setShowBankPicker] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!address) return;

    let cancelled = false;

    async function load() {
      const remote = await loadChatMessages(tradeId, address as string);
      if (cancelled || !remote) return; // load failed -> keep local as-is
      const currentLocal = useP2PStore.getState().messagesByTrade[tradeId] ?? [];
      if (remote.length > 0 || currentLocal.length === 0) {
        setMessages(tradeId, remote);
      }
      // else: remote came back empty but local already has history for
      // this trade (Supabase just hasn't seen it yet) -> leave local alone.
    }

    load();
    const interval = setInterval(load, CHAT_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [tradeId, address, setMessages]);

  function send(partial: Partial<ChatMessage>) {
    const localMessage: ChatMessage = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tradeId,
      sender: myRole,
      senderAddress: address,
      timestamp: Date.now(),
      ...partial,
    };
    // Optimistic: shows instantly, unchanged from prior behavior.
    addMessage(tradeId, localMessage);
    setSendError(null);

    if (!address) return;

    sendChatMessage({
      tradeId,
      wallet: address,
      senderRole: myRole,
      text: partial.text,
      proofUrl: partial.proofDataUrl,
      bankDetails: partial.bankDetails,
    }).then((result) => {
      if (!result.ok) {
        // Message stays visible locally (nothing removed/hidden) — this is
        // purely "it wasn't saved to the cloud yet," surfaced clearly per
        // this step's rule, not a silent failure.
        setSendError(`Not saved to cloud: ${result.error}`);
      }
    });
  }

  function handleSend() {
    if (!text.trim()) return;
    send({ text: text.trim() });
    setText("");
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      send({ proofDataUrl: reader.result as string, text: "Payment proof attached" });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  /** Posts a clean, non-editable structured message — the recipient sees the same bubble style as any other message, just with the bank fields laid out instead of freeform text. */
  function shareBankAccount(account: (typeof bankAccounts)[number]) {
    send({
      bankDetails: {
        bankName: account.bankName,
        accountName: account.accountName,
        accountNumber: account.accountNumber,
        currency: account.currency,
      },
    });
    setShowBankPicker(false);
  }

  return (
    <div className="glass-panel flex flex-col h-80">
      <div className="px-4 py-3 border-b border-white/15 dark:border-white/5 text-sm font-medium">Trade chat</div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-xs text-ink-muted text-center mt-8">
            Say hi, confirm payment details, and attach a screenshot once you've sent the fiat.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={m.sender === myRole ? "flex justify-end" : "flex justify-start"}>
            <div
              className={
                m.sender === myRole
                  ? "bg-vlite-gradient text-white rounded-2xl rounded-br-md px-3 py-2 max-w-[75%]"
                  : "glass-panel-flush rounded-2xl rounded-bl-md px-3 py-2 max-w-[75%]"
              }
            >
              {m.bankDetails ? (
                <div className="space-y-1">
                  <p className="text-sm font-semibold flex items-center gap-1.5">🏦 Bank details shared</p>
                  <p className="text-sm font-medium">
                    {m.bankDetails.bankName} · {m.bankDetails.currency}
                  </p>
                  <p className={`text-xs stat-mono ${m.sender === myRole ? "text-white/85" : "text-ink-muted"}`}>
                    {m.bankDetails.accountName} — {m.bankDetails.accountNumber}
                  </p>
                </div>
              ) : (
                <>
                  {m.proofDataUrl && (
                    <div className="mb-1.5 rounded-xl overflow-hidden border border-white/20">
                      <Image src={m.proofDataUrl} alt="Payment proof" width={220} height={160} className="object-cover" unoptimized />
                    </div>
                  )}
                  {m.text && <p className="text-sm">{m.text}</p>}
                </>
              )}
              <p className="text-[10px] opacity-70 mt-0.5">{new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Share bank details — only the seller (the party receiving fiat) has
          a reason to share payment details, so this is hidden entirely for
          the buyer. Works the same for a merchant or a regular user, since
          it just reads whichever saved accounts belong to the connected
          address (Profile > Bank details). */}
      {myRole === "seller" && (
        <div className="relative px-3 pt-2 border-t border-white/15 dark:border-white/5">
          <button
            onClick={() => setShowBankPicker((v) => !v)}
            className="w-full flex items-center justify-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink-light dark:hover:text-ink-dark py-1.5"
          >
            <Landmark size={13} />
            Share bank details
          </button>

          {showBankPicker && (
            <div className="absolute bottom-full left-3 right-3 mb-1 glass-panel p-2 space-y-1 max-h-40 overflow-y-auto z-10">
              <div className="flex items-center justify-between px-1 pb-1">
                <span className="text-[11px] text-ink-muted">Choose an account to share</span>
                <button onClick={() => setShowBankPicker(false)} aria-label="Close">
                  <X size={13} className="text-ink-muted" />
                </button>
              </div>
              {bankAccounts.length === 0 ? (
                <p className="text-xs text-ink-muted px-1 pb-1">No saved bank accounts yet — add one in Profile &gt; Bank details.</p>
              ) : (
                bankAccounts.map((acc) => (
                  <button
                    key={acc.id}
                    onClick={() => shareBankAccount(acc)}
                    className="w-full text-left rounded-xl px-2.5 py-2 hover:bg-white/40 dark:hover:bg-white/5 transition-colors"
                  >
                    <p className="text-xs font-medium">
                      {acc.bankName} · {acc.currency}
                    </p>
                    <p className="text-[11px] text-ink-muted stat-mono">
                      {acc.accountName} — {acc.accountNumber}
                    </p>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {sendError && <p className="px-4 pb-1 text-[11px] text-danger">{sendError}</p>}

      <div className="p-3 border-t border-white/15 dark:border-white/5 flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleFile}
        />
        <button onClick={() => fileInputRef.current?.click()} className="btn-vlite-icon shrink-0" aria-label="Attach payment proof">
          <Paperclip size={16} />
        </button>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
          placeholder="Message…"
          className="flex-1 rounded-xl px-3 py-2 bg-white/50 dark:bg-white/5 border border-white/30 dark:border-white/10 text-sm outline-none focus:ring-2 focus:ring-vlite-cyan"
        />
        <button onClick={handleSend} className="btn-vlite-icon shrink-0" aria-label="Send message">
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
