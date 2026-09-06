// Notification presentation: thin wrapper over the canonical registry in
// convex/lib/notificationRegistry.ts. Previously this file re-implemented
// every sentence, which let kinds drift out of sync with producers and with
// Telegram. Keep rendering logic in the registry only.

export type NotifTone = "info" | "success" | "warning" | "danger";

export {
  notificationView,
  notificationDestination,
  NOTIFICATION_CONTRACTS,
  type NotifView,
} from "../../convex/lib/notificationRegistry";

/** "just now" / "2h ago" / "Mon" — compact, scannable. */
export function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const mins = Math.floor((Date.now() - t) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days}d ago`;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}