// How a homework deadline reads to a human.
//
// POLICY §10: homework carries no obligation for the student — completion is
// a retention signal the teacher acts on, never something the student is
// punished for. So "overdue" is amber and factual ("Was due Friday"), never
// red, never scolding. The deadline exists to answer one question: do I need
// to do this before my next lesson?

export type DueTone = "none" | "later" | "soon" | "overdue";

export interface DueState {
  label: string;
  tone: DueTone;
}

export interface DueCopy {
  dueTodayAt: (time: string) => string;
  dueTomorrowAt: (time: string) => string;
  wasDueTodayAt: (time: string) => string;
  wasDueYesterday: string;
  dueDate: (date: string) => string;
  wasDueDate: (date: string) => string;
  dueWeekday: (weekday: string) => string;
}

const EN_DUE_COPY: DueCopy = {
  dueTodayAt: (time) => `Due today at ${time}`,
  dueTomorrowAt: (time) => `Due tomorrow at ${time}`,
  wasDueTodayAt: (time) => `Was due today at ${time}`,
  wasDueYesterday: "Was due yesterday",
  dueDate: (date) => `Due ${date}`,
  wasDueDate: (date) => `Was due ${date}`,
  dueWeekday: (weekday) => `Due ${weekday}`,
};

const DAY = 86_400_000;

/** Calendar days between two instants, in the viewer's own local days. */
function dayDiff(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((da - db) / DAY);
}

export function dueState(
  dueAt?: string | null,
  now: Date = new Date(),
  locale = "en-US",
  copy: DueCopy = EN_DUE_COPY,
): DueState {
  if (!dueAt) return { label: "", tone: "none" };
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return { label: "", tone: "none" };

  const days = dayDiff(due, now);
  const time = due.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const date = due.toLocaleDateString(locale, { month: "short", day: "numeric" });
  const weekday = due.toLocaleDateString(locale, { weekday: "long" });

  if (due.getTime() < now.getTime()) {
    if (days === 0) return { label: copy.wasDueTodayAt(time), tone: "overdue" };
    if (days === -1) return { label: copy.wasDueYesterday, tone: "overdue" };
    return { label: copy.wasDueDate(date), tone: "overdue" };
  }

  if (days === 0) return { label: copy.dueTodayAt(time), tone: "soon" };
  if (days === 1) return { label: copy.dueTomorrowAt(time), tone: "soon" };
  if (days <= 6) {
    return {
      label: copy.dueWeekday(weekday),
      tone: days <= 2 ? "soon" : "later",
    };
  }
  return { label: copy.dueDate(date), tone: "later" };
}

/** Colors matching the tone. Amber for late — never alarm-red (POLICY §10). */
export function dueColors(tone: DueTone): { bg: string; fg: string } {
  switch (tone) {
    case "overdue":
      return { bg: "#FEF3C7", fg: "#92400E" };
    case "soon":
      return { bg: "var(--omnic-tenant-primary-soft)", fg: "var(--omnic-tenant-primary)" };
    default:
      return { bg: "var(--omnic-gray-100)", fg: "var(--omnic-gray-600)" };
  }
}
