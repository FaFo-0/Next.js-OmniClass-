import type { MutationCtx } from "../_generated/server";
import { automaticLessonTitle, isDefaultLessonTitle, planLessonNumbers } from "./lessonTitles";

/** Called within booking/move/cancel transactions, so concurrent bookings retry atomically. */
export async function syncLessonTitles(ctx: MutationCtx, orgId: string, studentId: string) {
  const events = await ctx.db.query("scheduleEvents").withIndex("by_organization_and_studentId", q => q.eq("organizationId", orgId).eq("studentId", studentId)).take(5000);
  const lessons = await ctx.db.query("lessons").withIndex("by_organization_and_studentId", q => q.eq("organizationId", orgId).eq("studentId", studentId)).take(5000);
  if (events.length === 5000 || lessons.length === 5000) throw new Error("Lesson history requires paginated numbering");
  const settings = await ctx.db.query("tenantSettings").withIndex("by_organization", q => q.eq("organizationId", orgId)).unique();
  const names = settings?.activityTypes?.map(a => a.name) ?? [];
  const numbers = planLessonNumbers(events.filter(e => e.type === "1on1"));
  for (const event of events) {
    if (event.type !== "1on1") continue;
    const number = numbers.get(event._id);
    const titleSource = event.titleSource ?? (isDefaultLessonTitle(event.title, names) ? "automatic" : "teacher");
    const title = titleSource === "automatic" ? automaticLessonTitle(number, event.titleTopic) : event.title;
    if (event.lessonNumber !== number || event.title !== title || event.titleSource !== titleSource) {
      await ctx.db.patch(event._id, { lessonNumber: number, title, titleSource });
    }
    for (const lesson of lessons) {
      if (lesson.isDeleted || lesson.scheduleEventId !== event._id) continue;
      const source = lesson.titleSource ?? (titleSource === "teacher" || !isDefaultLessonTitle(lesson.title, names) ? "teacher" : "automatic");
      const lessonTitle = source === "automatic" ? automaticLessonTitle(number, lesson.titleTopic) : lesson.title;
      if (lesson.lessonNumber !== number || lesson.title !== lessonTitle || lesson.titleSource !== source) {
        await ctx.db.patch(lesson._id, { lessonNumber: number, title: lessonTitle, titleSource: source });
      }
    }
  }
}
