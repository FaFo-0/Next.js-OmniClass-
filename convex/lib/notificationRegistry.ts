// ─────────────────────────────────────────────────────────────────────
// Notification contract registry — the single source of truth.
//
// Every notification kind the platform can emit is listed here with:
//   - who may receive it (audiences)
//   - in-app title/body/icon/tone (the bell)
//   - a role-aware destination so a click always lands somewhere useful
//   - Telegram title/body/fallback message composition
//
// The Convex schema union and `_notify` validator are derived from
// NOTIFICATION_KINDS so producers, rendering and destinations cannot drift.
//
// This file is PURE TypeScript — no Convex server imports — so it can be
// imported by tests, by the Next.js frontend, and by Convex actions alike.
// ─────────────────────────────────────────────────────────────────────

export type NotifRole = "student" | "teacher" | "admin";
export type NotifTone = "info" | "success" | "warning" | "danger";

export const NOTIFICATION_KINDS = [
  "session_published",
  "reschedule_request",
  "reschedule_resolved",
  "permission_request",
  "achievement_unlocked",
  "invoice",
  "impersonation",
  "teacher_no_show",
  "makeup_credit_issued",
  "student_assigned",
  "student_unassigned",
  "points_granted",
  "points_refunded",
  "booking_reminder",
  "homework_assigned",
  "homework_submitted",
  "homework_reviewed",
  "unscheduled_session",
  "session_reminder",
  "lesson_cancelled",
  "lesson_rescheduled",
  "lesson_assigned",
  "teacher_time_off",
  "lessons_requested",
  "finance_entry_due",
  "salary_paid",
  "payment_received",
  "payment_refunded",
  "payment_failed",
  "one_time_lesson_started",
] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

type Payload = Record<string, unknown>;

// ── tiny readers ────────────────────────────────────────────────────
const s = (payload: Payload, key: string): string | undefined =>
  typeof payload[key] === "string" && String(payload[key]).trim()
    ? String(payload[key])
    : undefined;

const firstWord = (name?: string): string => name?.split(" ")[0] ?? "?";

/** "today"/"tomorrow"/"Wed, Sep 9" from a "YYYY-MM-DD" date. */
function fmtDate(date?: string): string {
  if (!date) return "";
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  const today = new Date();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "today";
  if (same(d, tomorrow)) return "tomorrow";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function at(payload: Payload, dateKey = "date", timeKey = "startTime"): string {
  const date = fmtDate(s(payload, dateKey));
  const time = s(payload, timeKey);
  if (date && time) return `${date} at ${time}`;
  return date || time || "";
}

/** Who performed the action, second person where it reads better. */
function actor(by?: string): string {
  switch (by) {
    case "student": return "Your student";
    case "teacher": return "Your teacher";
    case "admin": return "The academy";
    case "weekly-schedule": return "Your weekly schedule";
    default: return "Someone";
  }
}

// ── contract shape ──────────────────────────────────────────────────
export interface NotifContract {
  kind: NotificationKind;
  /** Which portals may legitimately receive this kind. */
  audiences: NotifRole[];
  /** Reject malformed new writes before they become an empty or misleading bell row. */
  validatePayload?: (payload: Payload) => string[];
  icon: string;
  tone: NotifTone;
  title: (payload: Payload) => string;
  body: (payload: Payload) => string;
  /** Role-aware fallback destination. Stored links on the row win. */
  destination: (payload: Payload, role: NotifRole) => string | undefined;
}

// ─────────────────────────────────────────────────────────────────────
// Contract table
// ─────────────────────────────────────────────────────────────────────
export const NOTIFICATION_CONTRACTS: Record<NotificationKind, NotifContract> = {
  lesson_assigned: {
    kind: "lesson_assigned",
    audiences: ["student", "admin"],
    icon: "calendar",
    tone: "success",
    title: () => "Lesson booked",
    body: (p) =>
      p.by === "weekly-schedule"
        ? `Your weekly slot booked ${at(p)}.`
        : `${actor(s(p, "by"))} booked a lesson ${at(p)}.`,
    destination: (_p, role) =>
      role === "admin" ? "/admin/calendar" : "/student/calendar",
  },

  one_time_lesson_started: {
    kind: "one_time_lesson_started",
    audiences: ["admin", "student"],
    validatePayload: (p) => [
      ...[
        "teacherId",
        "teacherName",
        "studentId",
        "studentName",
        "date",
        "startTime",
        "lessonId",
        "eventId",
      ]
        .filter((key) => !s(p, key))
        .map((key) => `payload.${key} must be a non-empty string`),
      ...(typeof p.unpaid === "boolean" ? [] : ["payload.unpaid must be a boolean"]),
    ],
    icon: "video",
    tone: "success",
    title: () => "One-time lesson started",
    body: (p) => {
      const teacher = s(p, "teacherName") ?? "A teacher";
      const student = s(p, "studentName") ?? "a student";
      const base = `${teacher} started a one-time lesson with ${student} ${at(p)}.`;
      return p.unpaid
        ? `${base} No lesson credit was available — review billing.`
        : base;
    },
    destination: (p, role) =>
      role === "admin"
        ? s(p, "lessonId")
          ? `/admin/sessions?lesson=${p.lessonId}`
          : s(p, "eventId")
            ? `/admin/calendar?event=${p.eventId}`
            : "/admin/sessions"
        : "/student/calendar",
  },

  teacher_time_off: {
    kind: "teacher_time_off",
    audiences: ["admin"],
    icon: "calendar",
    tone: "warning",
    title: (p) => (p.needsApproval ? "Time off — please review" : "Teacher time off"),
    body: (p) =>
      `${s(p, "teacherName") ?? "A teacher"} blocked ${p.days ?? "?"} day${
        p.days === 1 ? "" : "s"
      } (${s(p, "fromDate") ?? ""} → ${s(p, "toDate") ?? ""})${
        p.needsApproval ? " — longer than 3 days, so it needs your sign-off." : "."
      }`,
    destination: () => "/admin/calendar",
  },

  lesson_cancelled: {
    kind: "lesson_cancelled",
    audiences: ["student", "teacher"],
    icon: "calendar",
    tone: "warning",
    title: () => "Lesson cancelled",
    body: (p) =>
      `${actor(s(p, "by"))} cancelled the lesson ${at(p)}${
        p.charged ? " — the lesson was charged." : " — the credit was returned."
      }`,
    destination: (_p, role) => (role === "teacher" ? "/teacher/calendar" : "/student/calendar"),
  },

  lesson_rescheduled: {
    kind: "lesson_rescheduled",
    audiences: ["student", "teacher"],
    icon: "calendar",
    tone: "info",
    title: () => "Lesson moved",
    body: (p) =>
      `${actor(s(p, "by"))} moved the lesson from ${at(p, "fromDate", "fromTime")} to ${at(
        p,
        "toDate",
        "toTime"
      )}.`,
    destination: (_p, role) => (role === "teacher" ? "/teacher/calendar" : "/student/calendar"),
  },

  session_reminder: {
    kind: "session_reminder",
    audiences: ["student", "teacher"],
    icon: "clock",
    tone: "info",
    title: (p) => (p.when === "24h" ? "Lesson tomorrow" : "Lesson starting soon"),
    body: (p) => `${s(p, "title") ?? "Your lesson"} — ${at(p)}.`,
    destination: (_p, role) => (role === "teacher" ? "/teacher/calendar" : "/student/calendar"),
  },

  teacher_no_show: {
    kind: "teacher_no_show",
    audiences: ["student", "admin"],
    icon: "alert",
    tone: "danger",
    title: () => "Teacher didn't show",
    body: (p) =>
      `${s(p, "title") ?? "The lesson"} was marked a teacher no-show${
        p.refunded ? " — your lesson credit was returned." : "."
      }`,
    destination: (_p, role) => (role === "admin" ? "/admin/calendar" : "/student/calendar"),
  },

  unscheduled_session: {
    kind: "unscheduled_session",
    audiences: ["admin"],
    icon: "alert",
    tone: "warning",
    title: () => "Unscheduled session",
    body: (p) =>
      `${s(p, "teacherName") ?? "A teacher"} started "${s(p, "title") ?? "a lesson"}" without a booked slot.`,
    destination: () => "/admin/sessions",
  },

  homework_assigned: {
    kind: "homework_assigned",
    audiences: ["student"],
    icon: "book",
    tone: "info",
    title: () => "New homework",
    body: (p) => `${s(p, "title") ?? "Homework"} was assigned to you.`,
    destination: (p) => (s(p, "homeworkId") ? `/student/homework/${p.homeworkId}` : "/student/homework"),
  },

  homework_submitted: {
    kind: "homework_submitted",
    audiences: ["teacher", "admin"],
    icon: "book",
    tone: "success",
    title: () => "Homework submitted",
    body: (p) => `A student submitted ${s(p, "title") ?? "their homework"} — ready to review.`,
    destination: (p, role) =>
      role === "admin"
        ? "/admin/attention"
        : s(p, "lessonId")
          ? `/teacher/sessions/${p.lessonId}`
          : "/teacher/students",
  },

  homework_reviewed: {
    kind: "homework_reviewed",
    audiences: ["student"],
    icon: "book",
    tone: "success",
    title: () => "Homework reviewed",
    body: (p) => `Your teacher reviewed ${s(p, "title") ?? "your homework"}.`,
    destination: (p) => (s(p, "homeworkId") ? `/student/homework/${p.homeworkId}` : "/student/homework"),
  },

  booking_reminder: {
    kind: "booking_reminder",
    audiences: ["student"],
    icon: "calendar",
    tone: "info",
    title: (p) => (p.reason === "pause_ended" ? "Your pause ended" : "Weekly lesson skipped"),
    body: (p) =>
      p.reason === "pause_ended"
        ? "Your lessons are active again — book your next one."
        : "You ran out of lessons, so this week's slot was skipped. Top up to keep it.",
    destination: () => "/student/calendar",
  },

  makeup_credit_issued: {
    kind: "makeup_credit_issued",
    audiences: ["student"],
    icon: "check",
    tone: "success",
    title: () => "Make-up credit issued",
    body: () => "A make-up lesson was added to your balance.",
    destination: () => "/student/calendar",
  },

  student_assigned: {
    kind: "student_assigned",
    audiences: ["teacher"],
    icon: "users",
    tone: "success",
    title: () => "New student",
    body: (p) => `${s(p, "studentName") ?? "A student"} was assigned to you.`,
    destination: () => "/teacher/students",
  },

  student_unassigned: {
    kind: "student_unassigned",
    audiences: ["teacher"],
    icon: "users",
    tone: "info",
    title: () => "Student removed",
    body: (p) => `${s(p, "studentName") ?? "A student"} is no longer assigned to you.`,
    destination: () => "/teacher/students",
  },

  reschedule_request: {
    kind: "reschedule_request",
    audiences: ["admin", "teacher"],
    icon: "calendar",
    tone: "warning",
    title: () => "Reschedule requested",
    body: (p) =>
      `${actor(s(p, "by"))} asked to move a lesson${s(p, "date") ? ` on ${fmtDate(s(p, "date"))}` : ""}.`,
    destination: () => "/admin/scheduling/requests",
  },

  reschedule_resolved: {
    kind: "reschedule_resolved",
    audiences: ["student", "teacher"],
    icon: "calendar",
    tone: "success",
    title: () => "Reschedule resolved",
    body: (p) => (p.approved ? "The reschedule was approved." : "The reschedule was declined."),
    destination: (_p, role) => (role === "teacher" ? "/teacher/calendar" : "/student/calendar"),
  },

  permission_request: {
    kind: "permission_request",
    audiences: ["admin"],
    icon: "alert",
    tone: "warning",
    title: () => "Permission request",
    body: (p) => s(p, "reason") ?? "Someone requested access to an action.",
    destination: () => "/admin/attention",
  },

  session_published: {
    kind: "session_published",
    audiences: ["student"],
    icon: "book",
    tone: "success",
    title: () => "Lesson materials ready",
    body: (p) => `${s(p, "title") ?? "Your lesson"} — summary, vocabulary and flashcards are up.`,
    destination: (p) => (s(p, "lessonId") ? `/student/lessons/${p.lessonId}` : "/student/lessons"),
  },

  lessons_requested: {
    kind: "lessons_requested",
    audiences: ["admin", "student"],
    icon: "dollar",
    tone: "warning",
    title: () => "Lessons requested",
    body: (p) =>
      `${s(p, "studentName") ?? "A student"} asked for ${s(p, "packName") ?? "more lessons"}${
        p.lessons ? ` (${p.lessons} lesson${p.lessons === 1 ? "" : "s"})` : ""
      }${s(p, "note") ? ` "${p.note}"` : ""}`,
    destination: (_p, role) => (role === "admin" ? "/admin/billing" : "/student/billing"),
  },

  payment_received: {
    kind: "payment_received",
    audiences: ["student", "admin"],
    icon: "dollar",
    tone: "success",
    title: (p) => (s(p, "studentName") ? "Payment received" : "Payment complete"),
    body: (p) =>
      s(p, "studentName")
        ? `${s(p, "studentName")} bought ${s(p, "packName") ?? "a pack"}${
            p.lessons ? ` — ${p.lessons} lesson${p.lessons === 1 ? "" : "s"}` : ""
          }.`
        : `${s(p, "packName") ?? "Your pack"} is paid for${
            p.lessons ? ` — ${p.lessons} lesson${p.lessons === 1 ? "" : "s"} added` : ""
          }${p.balanceAfter != null ? `. You now have ${p.balanceAfter}.` : "."}`,
    destination: (_p, role) => (role === "admin" ? "/admin/billing" : "/student/billing"),
  },

  payment_refunded: {
    kind: "payment_refunded",
    audiences: ["student", "admin"],
    icon: "dollar",
    tone: "warning",
    title: () => "Payment refunded",
    body: (p) =>
      `Order ${s(p, "orderId") ?? ""} was refunded${
        p.amount ? ` (${p.amount} ${s(p, "currency") ?? ""})` : ""
      }${
        p.lessons
          ? ` — ${p.lessons} unused lesson${p.lessons === 1 ? "" : "s"} taken back.`
          : " — all its lessons had already been used."
      }`,
    destination: (_p, role) => (role === "admin" ? "/admin/billing" : "/student/billing"),
  },

  payment_failed: {
    kind: "payment_failed",
    audiences: ["admin"],
    icon: "alert",
    tone: "danger",
    title: () => "Payment couldn't be applied",
    body: (p) =>
      s(p, "message") ??
      "A payment came in that we couldn't match to a student. Check Settings → Card payments.",
    destination: () => "/admin/billing",
  },

  finance_entry_due: {
    kind: "finance_entry_due",
    audiences: ["admin"],
    icon: "dollar",
    tone: "warning",
    title: () => "Money to record",
    body: (p) =>
      `${s(p, "label") ?? "A recurring cost"} for ${s(p, "period") ?? "this period"} hasn't been entered${
        p.expectedAmount ? ` (usually ${p.expectedAmount} ${s(p, "currency") ?? ""})` : ""
      }.`,
    destination: () => "/admin/billing?tab=expenses",
  },

  salary_paid: {
    kind: "salary_paid",
    audiences: ["teacher"],
    icon: "dollar",
    tone: "success",
    title: () => "Payment sent",
    body: (p) =>
      `${p.amount ?? ""} ${s(p, "currency") ?? ""} for ${p.lessons ?? 0} lesson${
        p.lessons === 1 ? "" : "s"
      } in ${s(p, "month") ?? "this month"}.`,
    destination: () => "/teacher/profile",
  },

  achievement_unlocked: {
    kind: "achievement_unlocked",
    audiences: ["student"],
    icon: "award",
    tone: "success",
    title: () => "Achievement unlocked",
    body: (p) => s(p, "name") ?? "You earned a new achievement.",
    destination: () => "/student/achievements",
  },

  invoice: {
    kind: "invoice",
    audiences: ["student"],
    icon: "dollar",
    tone: "info",
    title: () => "Invoice",
    body: (p) => s(p, "reason") ?? "A new invoice is available.",
    destination: () => "/student/billing",
  },

  impersonation: {
    kind: "impersonation",
    audiences: ["admin"],
    icon: "alert",
    tone: "warning",
    title: () => "Admin session",
    body: (p) => s(p, "reason") ?? "An admin signed in on your behalf.",
    destination: () => "/admin",
  },

  points_granted: {
    kind: "points_granted",
    audiences: ["student"],
    icon: "check",
    tone: "success",
    title: () => "Lessons added",
    body: (p) => `You received ${p.points ?? "?"} lesson${p.points === 1 ? "" : "s"}${s(p, "reason") ? ` — ${p.reason}` : ""}.`,
    destination: () => "/student/billing",
  },

  points_refunded: {
    kind: "points_refunded",
    audiences: ["student"],
    icon: "check",
    tone: "success",
    title: () => "Lesson returned",
    body: (p) => `A lesson credit was returned to your balance${s(p, "reason") ? ` — ${p.reason}` : ""}.`,
    destination: () => "/student/billing",
  },
};

// ── in-app view (the bell) ──────────────────────────────────────────
export interface NotifView {
  title: string;
  body: string;
  icon: string;
  tone: NotifTone;
}

export function notificationView(kind: string, payload: Payload | null | undefined): NotifView {
  const contract = NOTIFICATION_CONTRACTS[kind as NotificationKind];
  const p = payload ?? {};
  if (!contract) {
    return {
      title: kind.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      body: typeof p.reason === "string" ? p.reason : "",
      icon: "bell",
      tone: "info",
    };
  }
  return { title: contract.title(p), body: contract.body(p), icon: contract.icon, tone: contract.tone };
}

/**
 * Validates a new notification write against the same registry used by every
 * presentation surface. Historical rows remain readable via `notificationView`
 * even when they pre-date these write-time requirements.
 */
export function notificationContractIssues(
  kind: string,
  payload: Payload | null | undefined,
  role: NotifRole
): string[] {
  const contract = NOTIFICATION_CONTRACTS[kind as NotificationKind];
  if (!contract) return [`unknown notification kind ${kind}`];
  const issues: string[] = [];
  if (!contract.audiences.includes(role)) {
    issues.push(`recipient role ${role} is not allowed`);
  }
  issues.push(...(contract.validatePayload?.(payload ?? {}) ?? []));
  return issues;
}

// ── role-aware destination ──────────────────────────────────────────
export function notificationDestination(
  kind: string,
  payload: Payload | null | undefined,
  storedLink?: string,
  role: NotifRole = "student"
): string | undefined {
  if (storedLink) return storedLink;
  const contract = NOTIFICATION_CONTRACTS[kind as NotificationKind];
  if (!contract || !contract.audiences.includes(role)) return undefined;
  return contract.destination(payload ?? {}, role);
}

// ── Telegram composition ────────────────────────────────────────────
export interface TelegramMessage {
  text: string;
  buttonUrl?: string;
  buttonLabel?: string;
}

export function telegramMessage(
  kind: string,
  payload: Payload | null | undefined,
  link?: string,
  role: NotifRole = "student"
): TelegramMessage {
  const view = notificationView(kind, payload);
  const p = payload ?? {};
  const meetLink = s(p, "googleMeetLink");
  const lines = [`🔔 ${view.title}`, view.body];
  if (meetLink) lines.push(`\nJoin meeting: ${meetLink}`);
  const buttonUrl = link ?? notificationDestination(kind, payload, undefined, role);
  return {
    text: lines.filter(Boolean).join("\n"),
    buttonUrl,
    buttonLabel: meetLink ? "Open lesson" : "Open OmniClass",
  };
}

/** Compact name used by reminder copy when only an ID is known. */
export const notificationName = firstWord;