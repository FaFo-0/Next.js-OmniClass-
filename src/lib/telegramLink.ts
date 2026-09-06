const TELEGRAM_BOT_USERNAME = /^[A-Za-z][A-Za-z0-9_]{4,31}$/;

/** Telegram deep links accept a bot username without `@` and a start payload. */
export function isValidTelegramBotUsername(value: string): boolean {
  return TELEGRAM_BOT_USERNAME.test(value.replace(/^@/, ""));
}

/** Build the universal Telegram link; desktop shows Telegram's safe hand-off page. */
export function buildTelegramStartUrl(botUsername: string, code: string): string {
  const username = botUsername.replace(/^@/, "");
  if (!isValidTelegramBotUsername(username)) {
    throw new Error("Telegram bot username is not configured correctly.");
  }
  return `https://t.me/${username}?start=${encodeURIComponent(code)}`;
}

// Role-aware destination resolution moved into the canonical notification
// registry (convex/lib/notificationRegistry.ts) so the bell, Telegram and
// tests all share one mapping.
export { notificationDestination } from "../../convex/lib/notificationRegistry.ts";
export type { NotifRole } from "../../convex/lib/notificationRegistry.ts";