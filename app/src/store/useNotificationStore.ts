import { create } from "zustand";
import { persist } from "zustand/middleware";

export type NotificationCategory =
  | "p2p_trade"
  | "escrow"
  | "airtime"
  | "merchant"
  | "username"
  | "send"
  | "system";

export interface VLiteNotification {
  id: string;
  category: NotificationCategory;
  title: string;
  message: string;
  timestamp: number;
  read: boolean;
  /** Optional in-app route to navigate to when the notification is clicked. */
  href?: string;
}

interface NotificationState {
  notifications: VLiteNotification[];
  add: (n: Omit<VLiteNotification, "id" | "timestamp" | "read">) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
  unreadCount: () => number;
}

const MAX_NOTIFICATIONS = 100;

export const useNotificationStore = create<NotificationState>()(
  persist(
    (set, get) => ({
      notifications: [],

      add: (n) =>
        set((s) => ({
          notifications: [
            { ...n, id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, timestamp: Date.now(), read: false },
            ...s.notifications,
          ].slice(0, MAX_NOTIFICATIONS),
        })),

      markRead: (id) =>
        set((s) => ({ notifications: s.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)) })),

      markAllRead: () => set((s) => ({ notifications: s.notifications.map((n) => ({ ...n, read: true })) })),

      clearAll: () => set({ notifications: [] }),

      unreadCount: () => get().notifications.filter((n) => !n.read).length,
    }),
    { name: "vlitepay-notifications" }
  )
);
