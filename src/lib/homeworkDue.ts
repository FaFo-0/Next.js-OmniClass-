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

const DAY = 86_400_000;

/** Calendar days between two instants, in the viewer's own local days. */
function dayDiff(a: Date, b: Date): number {
  const da = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const db = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((da - db) / DAY);
}

/**
 * `dueAt` is a real instant (ISO), so it renders in whatever timezone the
 * reader's browser is in without any wall-clock conversion.
 */
export function dueState(dueAt?: string | null, now: Date = new Date()): DueState {
  if (!dueAt) return { label: "", tone: "none" };
  const due = new Date(dueAt);
  if (Number.isNaN(due.getTime())) return { label: "", tone: "none" };

  const days = dayDiff(due, now);
  const time = due.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (due.getTime() < now.getTime()) {
    if (days === 0) return { label: `Was due today at ${time}`, tone: "overdue" };
    if (days === -1) return { label: "Was due yesterday", tone: "overdue" };
    return {
      label: `Was due ${due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
      tone: "overdue",
    };
  }

  if (days === 0) return { label: `Due today at ${time}`, tone: "soon" };
  if (days === 1) return { label: `Due tomorrow at ${time}`, tone: "soon" };
  if (days <= 6) {
    return {
      label: `Due ${due.toLocaleDateString(undefined, { weekday: "long" })}`,
      tone: days <= 2 ? "soon" : "later",
    };
  }
  return {
    label: `Due ${due.toLocaleDateString(undefined, { month: "short", day: "numeric" })}`,
    tone: "later",
  };
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
