// Notification presentation: thin wrapper over the canonical registry in
// convex/lib/notificationRegistry.ts. Previously this file re-implemented
// every sentence, which let kinds drift out of sync with producers and with
// Telegram. Keep rendering logic in the registry only.

export type NotifTone = "info" | "success" | "warning" | "danger";

export {
  notificationView,
  notificationViewForLocale,
  type NotificationLocale,
  notificationDestination,
  NOTIFICATION_CONTRACTS,
  type NotifView,
} from "../../convex/lib/notificationRegistry.ts";

/** "just now" / "2h ago" / "Mon" — compact, scannable. */
export function relativeTime(iso: string, locale = "en"): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - t) / 60_000));
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "short" });
  if (minutes < 1) return format.format(0, "second");
  if (minutes < 60) return format.format(-minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return format.format(-hours, "hour");
  const days = Math.floor(hours / 24);
  if (days < 7) return format.format(-days, "day");
  return new Date(t).toLocaleDateString(locale, { month: "short", day: "numeric" });
}
