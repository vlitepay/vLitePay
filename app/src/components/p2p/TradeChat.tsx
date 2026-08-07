"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { Paperclip, Send } from "lucide-react";
import { useP2PStore } from "@/store/useP2PStore";
import { ChatMessage } from "@/lib/types/p2p";

/**
 * Local mini-chat for a trade. Messages are stored client-side (Zustand,
 * persisted) for now — this component is Socket.io-ready: swap `addMessage`
 * for a socket emit + listener pair once the backend chat gateway lands,
 * without changing the UI.
 */
export function TradeChat({ tradeId, myRole }: { tradeId: number; myRole: "buyer" | "seller" }) {
  const messages = useP2PStore((s) => s.messagesByTrade[tradeId] ?? []);
  const addMessage = useP2PStore((s) => s.addMessage);
  const [text, setText] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function send(partial: Partial<ChatMessage>) {
    addMessage(tradeId, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      tradeId,
      sender: myRole,
      timestamp: Date.now(),
      ...partial,
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
              {m.proofDataUrl && (
                <div className="mb-1.5 rounded-xl overflow-hidden border border-white/20">
                  <Image src={m.proofDataUrl} alt="Payment proof" width={220} height={160} className="object-cover" unoptimized />
                </div>
              )}
              {m.text && <p className="text-sm">{m.text}</p>}
              <p className="text-[10px] opacity-70 mt-0.5">{new Date(m.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
          </div>
        ))}
      </div>

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
