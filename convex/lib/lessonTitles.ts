/** Titles and numbers are separate: a teacher title is never inferred from AI output. */
export function isDefaultLessonTitle(title: string, activityNames: string[] = []): boolean {
  return !title.trim() || /^(?:Online 1-on-1|One-time lesson|English Lesson(?: \d+)?|Lesson(?: \d+)?)$/i.test(title.trim()) || activityNames.includes(title);
}

export function automaticLessonTitle(number?: number, topic?: string): string {
  return topic ? `${number ? `Lesson ${number} · ` : ""}${topic}` : `English Lesson${number ? ` ${number}` : ""}`;
}

export function parseLessonSummary(content: string): { summary: string; title?: string } {
  const data: unknown = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, ""));
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("AI returned an invalid lesson summary. Please try again.");
  const row = data as Record<string, unknown>;
  if (typeof row.summary !== "string" || !row.summary.trim()) throw new Error("AI returned an empty lesson summary. Please try again.");
  const title = typeof row.title === "string" ? row.title.trim().replace(/\s+/g, " ") : "";
  const words = title.split(" ").length;
  return { summary: row.summary.trim(), title: title && words >= 3 && words <= 8 && title.length <= 120 && !isDefaultLessonTitle(title) && !/^English Practice$/i.test(title) ? title : undefined };
}

export type NumberedEvent = {
  _id: string; date: string; startTime: string; status: string;
  lessonNumber?: number; teacherStartedAt?: string; isDeleted?: boolean;
};

export function planLessonNumbers(events: NumberedEvent[]): Map<string, number> {
  const active = events.filter(e => !e.isDeleted && ["scheduled", "makeup", "completed", "no_show_student"].includes(e.status))
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`) || a._id.localeCompare(b._id));
  const frozen = active.filter(e => e.status === "completed" || e.status === "no_show_student" || e.teacherStartedAt);
  const result = new Map<string, number>();
  let next = Math.max(0, ...frozen.map(e => e.lessonNumber ?? 0));
  for (const e of frozen) result.set(e._id, e.lessonNumber ?? ++next);
  for (const e of active) if (!result.has(e._id)) result.set(e._id, ++next);
  return result;
}
