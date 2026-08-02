// Notification presentation: turn a stored { kind, payload } into a real
// sentence. Previously the bell rendered only `payload.reason` — which almost
// no notification sets — so most rows were a label above a blank line.

export type NotifTone = "info" | "success" | "warning" | "danger";

export interface NotifView {
  title: string;
  body: string;
  icon: string; // Icon name from components/shared/icons
  tone: NotifTone;
}

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

function at(date?: string, time?: string): string {
  const d = fmtDate(date);
  if (d && time) return `${d} at ${time}`;
  return d || time || "";
}

/** Who performed the action, in the second person where it reads better. */
function actor(by?: string): string {
  switch (by) {
    case "student":
      return "Your student";
    case "teacher":
      return "Your teacher";
    case "admin":
      return "The academy";
    case "weekly-schedule":
      return "Your weekly schedule";
    default:
      return "Someone";
  }
}

export function notificationView(
  kind: string,
  payload: Record<string, any> | undefined | null
): NotifView {
  const p = (payload ?? {}) as Record<string, any>;

  switch (kind) {
    case "lesson_assigned":
      return {
        title: "Lesson booked",
        body:
          p.by === "weekly-schedule"
            ? `Your weekly slot booked ${at(p.date, p.startTime)}.`
            : `${actor(p.by)} booked a lesson ${at(p.date, p.startTime)}.`,
        icon: "calendar",
        tone: "success",
      };

    case "teacher_time_off":
      return {
        title: p.needsApproval ? "Time off — please review" : "Teacher time off",
        body: `${p.teacherName ?? "A teacher"} blocked ${p.days ?? "?"} day${
          p.days === 1 ? "" : "s"
        } (${p.fromDate} → ${p.toDate})${
          p.needsApproval ? " — longer than 3 days, so it needs your sign-off." : "."
        }`,
        icon: "calendar",
        tone: p.needsApproval ? "warning" : "info",
      };

    case "lesson_cancelled":
      return {
        title: "Lesson cancelled",
        body: `${actor(p.by)} cancelled the lesson ${at(p.date, p.startTime)}${
          p.charged ? " — the lesson was charged." : " — the credit was returned."
        }`,
        icon: "calendar",
        tone: p.charged ? "warning" : "info",
      };

    case "lesson_rescheduled":
      return {
        title: "Lesson moved",
        body: `${actor(p.by)} moved the lesson from ${at(p.fromDate, p.fromTime)} to ${at(
          p.toDate,
          p.toTime
        )}.`,
        icon: "calendar",
        tone: "info",
      };

    case "session_reminder":
      return {
        title: p.when === "24h" ? "Lesson tomorrow" : "Lesson starting soon",
        body: `${p.title ?? "Your lesson"} — ${at(p.date, p.startTime)}.`,
        icon: "clock",
        tone: "info",
      };

    case "teacher_no_show":
      return {
        title: "Teacher didn't show",
        body: `${p.title ?? "The lesson"} was marked a teacher no-show${
          p.refunded ? " — your lesson credit was returned." : "."
        }`,
        icon: "alert",
        tone: "danger",
      };

    case "unscheduled_session":
      return {
        title: "Unscheduled session",
        body: `${p.teacherName ?? "A teacher"} started "${p.title ?? "a lesson"}" without a booked slot.`,
        icon: "alert",
        tone: "warning",
      };

    case "homework_assigned":
      return {
        title: "New homework",
        body: `${p.title ?? "Homework"} was assigned to you.`,
        icon: "book",
        tone: "info",
      };

    case "homework_submitted":
      return {
        title: "Homework submitted",
        body: `A student submitted ${p.title ?? "their homework"} — ready to review.`,
        icon: "book",
        tone: "success",
      };

    case "homework_reviewed":
      return {
        title: "Homework reviewed",
        body: `Your teacher reviewed ${p.title ?? "your homework"}.`,
        icon: "book",
        tone: "success",
      };

    case "booking_reminder":
      return p.reason === "pause_ended"
        ? {
            title: "Your pause ended",
            body: "Your lessons are active again — book your next one.",
            icon: "calendar",
            tone: "info",
          }
        : {
            title: "Weekly lesson skipped",
            body: "You ran out of lessons, so this week's slot was skipped. Top up to keep it.",
            icon: "alert",
            tone: "warning",
          };

    case "makeup_credit_issued":
      return {
        title: "Make-up credit issued",
        body: "A make-up lesson was added to your balance.",
        icon: "check",
        tone: "success",
      };

    case "student_assigned":
      return {
        title: "New student",
        body: `${p.studentName ?? "A student"} was assigned to you.`,
        icon: "users",
        tone: "success",
      };

    case "student_unassigned":
      return {
        title: "Student removed",
        body: `${p.studentName ?? "A student"} is no longer assigned to you.`,
        icon: "users",
        tone: "info",
      };

    case "reschedule_request":
      return {
        title: "Reschedule requested",
        body: `${actor(p.by)} asked to move a lesson${p.date ? ` on ${fmtDate(p.date)}` : ""}.`,
        icon: "calendar",
        tone: "warning",
      };

    case "reschedule_resolved":
      return {
        title: "Reschedule resolved",
        body: p.approved ? "The reschedule was approved." : "The reschedule was declined.",
        icon: "calendar",
        tone: p.approved ? "success" : "info",
      };

    case "permission_request":
      return {
        title: "Permission request",
        body: p.reason ?? "Someone requested access to an action.",
        icon: "alert",
        tone: "warning",
      };

    case "session_published":
      return {
        title: "Lesson materials ready",
        body: `${p.title ?? "Your lesson"} — summary, vocabulary and flashcards are up.`,
        icon: "book",
        tone: "success",
      };

    case "lessons_requested":
      return {
        title: "Lessons requested",
        body: `${p.studentName ?? "A student"} asked for ${
          p.packName ? `${p.packName}` : "more lessons"
        }${p.lessons ? ` (${p.lessons} lesson${p.lessons === 1 ? "" : "s"})` : ""}.${
          p.note ? ` "${p.note}"` : ""
        }`,
        icon: "dollar",
        tone: "warning",
      };

    case "finance_entry_due":
      return {
        title: "Money to record",
        body: `${p.label ?? "A recurring cost"} for ${p.period ?? "this period"} hasn't been entered${
          p.expectedAmount ? ` (usually ${p.expectedAmount} ${p.currency ?? ""})` : ""
        }.`,
        icon: "dollar",
        tone: "warning",
      };

    case "salary_paid":
      return {
        title: "Payment sent",
        body: `${p.amount ?? ""} ${p.currency ?? ""} for ${p.lessons ?? 0} lesson${
          p.lessons === 1 ? "" : "s"
        } in ${p.month ?? "this month"}.`,
        icon: "dollar",
        tone: "success",
      };

    case "achievement_unlocked":
      return {
        title: "Achievement unlocked",
        body: p.name ?? "You earned a new achievement.",
        icon: "award",
        tone: "success",
      };

    default:
      return {
        title: kind.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
        body: typeof p.reason === "string" ? p.reason : "",
        icon: "bell",
        tone: "info",
      };
  }
}

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
