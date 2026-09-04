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

/** All notification surfaces must lead somewhere useful, even old rows without a stored link. */
export function notificationDestination(
  kind: string,
  payload: Record<string, unknown> | null | undefined,
  storedLink?: string
): string | undefined {
  if (storedLink) return storedLink;
  const p = payload ?? {};
  switch (kind) {
    case "session_published":
      return typeof p.lessonId === "string" ? `/student/lessons/${p.lessonId}` : "/student/lessons";
    case "homework_assigned":
    case "homework_reviewed":
      return typeof p.homeworkId === "string" ? `/student/homework/${p.homeworkId}` : "/student/homework";
    case "homework_submitted":
      return typeof p.lessonId === "string" ? `/teacher/sessions/${p.lessonId}` : "/teacher/students";
    case "achievement_unlocked":
      return "/student/achievements";
    case "salary_paid":
      return "/teacher/profile";
    case "payment_received":
    case "payment_refunded":
    case "payment_failed":
    case "lessons_requested":
      return "/student/billing";
    case "finance_entry_due":
      return "/admin/billing?tab=expenses";
    case "reschedule_request":
      return "/admin/scheduling/requests";
    case "reschedule_resolved":
    case "lesson_assigned":
    case "lesson_cancelled":
    case "lesson_rescheduled":
    case "session_reminder":
    case "teacher_no_show":
    case "makeup_credit_issued":
    case "booking_reminder":
      return "/student/calendar";
    default:
      return undefined;
  }
}
