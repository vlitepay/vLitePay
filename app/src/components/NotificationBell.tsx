"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import {
  Bell,
  Repeat,
  Lock,
  Smartphone,
  Store,
  AtSign,
  Send,
  Info,
  CheckCheck,
  Trash2,
  BellRing,
} from "lucide-react";
import { useNotificationStore, NotificationCategory } from "@/store/useNotificationStore";
import { requestNotificationPermission } from "@/lib/notify";

const CATEGORY_ICON: Record<NotificationCategory, typeof Bell> = {
  p2p_trade: Repeat,
  escrow: Lock,
  airtime: Smartphone,
  merchant: Store,
  username: AtSign,
  send: Send,
  system: Info,
};

const CATEGORY_COLOR: Record<NotificationCategory, string> = {
  p2p_trade: "text-vlite-purple",
  escrow: "text-vlite-cyan",
  airtime: "text-vlite-gold",
  merchant: "text-vlite-purple",
  username: "text-vlite-cyan",
  send: "text-success",
  system: "text-ink-muted",
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(
    typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted"
  );
  const notifications = useNotificationStore((s) => s.notifications);
  const markRead = useNotificationStore((s) => s.markRead);
  const markAllRead = useNotificationStore((s) => s.markAllRead);
  const clearAll = useNotificationStore((s) => s.clearAll);
  const router = useRouter();

  const unread = notifications.filter((n) => !n.read).length;

  async function enablePush() {
    const perm = await requestNotificationPermission();
    setPushEnabled(perm === "granted");
  }

  function handleClick(id: string, href?: string) {
    markRead(id);
    if (href) {
      router.push(href);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button onClick={() => setOpen((v) => !v)} className="btn-vlite-icon relative" aria-label="Notifications">
        <Bell size={17} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-danger text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.97 }}
              transition={{ duration: 0.15 }}
              className="glass-panel absolute right-0 mt-2 w-80 max-w-[90vw] z-50 overflow-hidden"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/15 dark:border-white/5">
                <span className="text-sm font-semibold">Notifications</span>
                <div className="flex items-center gap-2">
                  {notifications.length > 0 && (
                    <>
                      <button onClick={markAllRead} className="text-ink-muted hover:text-ink-light dark:hover:text-ink-dark" aria-label="Mark all read">
                        <CheckCheck size={15} />
                      </button>
                      <button onClick={clearAll} className="text-ink-muted hover:text-danger" aria-label="Clear all">
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
              </div>

              {!pushEnabled && (
                <button
                  onClick={enablePush}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-vlite-purple dark:text-vlite-cyan hover:bg-white/40 dark:hover:bg-white/5 transition border-b border-white/15 dark:border-white/5"
                >
                  <BellRing size={13} /> Enable browser push notifications
                </button>
              )}

              <div className="max-h-96 overflow-y-auto">
                {notifications.length === 0 ? (
                  <div className="px-4 py-10 text-center">
                    <Bell size={22} className="mx-auto text-ink-muted mb-2" />
                    <p className="text-xs text-ink-muted">No notifications yet — trade, transfer, or top-up activity will show up here.</p>
                  </div>
                ) : (
                  notifications.map((n) => {
                    const Icon = CATEGORY_ICON[n.category];
                    return (
                      <button
                        key={n.id}
                        onClick={() => handleClick(n.id, n.href)}
                        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-white/40 dark:hover:bg-white/5 transition border-b border-white/10 dark:border-white/5 last:border-0"
                      >
                        <div className={`h-8 w-8 rounded-full glass-panel-flush flex items-center justify-center shrink-0 ${CATEGORY_COLOR[n.category]}`}>
                          <Icon size={14} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {!n.read && <span className="h-1.5 w-1.5 rounded-full bg-vlite-cyan shrink-0" />}
                            <p className="text-sm font-medium truncate">{n.title}</p>
                          </div>
                          <p className="text-xs text-ink-muted mt-0.5 line-clamp-2">{n.message}</p>
                          <p className="text-[10px] text-ink-muted mt-1">{formatDistanceToNow(n.timestamp, { addSuffix: true })}</p>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
