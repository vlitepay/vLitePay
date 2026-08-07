import { useNotificationStore, NotificationCategory } from "@/store/useNotificationStore";

export interface NotifyInput {
  category: NotificationCategory;
  title: string;
  message: string;
  href?: string;
}

/**
 * Fire-and-forget notification helper, callable from anywhere (event
 * handlers, hooks, effects) without needing to subscribe to the store.
 * Always records the notification in-app; additionally fires a native
 * browser push notification if the user has granted permission.
 */
export function notify({ category, title, message, href }: NotifyInput) {
  useNotificationStore.getState().add({ category, title, message, href });

  if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
    try {
      const n = new Notification(title, { body: message, icon: "/logo.png", badge: "/logo.png" });
      if (href) {
        n.onclick = () => {
          window.focus();
          window.location.href = href;
        };
      }
    } catch {
      // Some browsers/contexts (e.g. iOS Safari without a service worker) can
      // throw here — the in-app notification above already covers the user.
    }
  }
}

/** Requests browser notification permission — call from a user gesture (e.g. a settings toggle). */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (typeof window === "undefined" || !("Notification" in window)) return "denied";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}
