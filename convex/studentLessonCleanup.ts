import { v } from "convex/values";
import { mutation, query, type QueryCtx, type MutationCtx } from "./_generated/server";
import { requireTenantPermission, tenantTable } from "./lib/tenant";
import { userHasPermission } from "./lib/permissions";
import { wallTimeToMs } from "./lib/time";
import { isPayable } from "./payroll";
import { syncLessonTitles } from "./lib/syncLessonTitles";

// A deliberate admin history cleanup, separate from policy-based cancellation.
async function plan(ctx: QueryCtx | MutationCtx, studentId: string) {
  const { orgId, user } = await requireTenantPermission(ctx, "lessons.delete");
  if (user.role !== "admin" || !userHasPermission(user, "billing.edit")) {
    throw new Error("Only an admin with lesson deletion and billing access can clear history");
  }
  const students = tenantTable(ctx, orgId, "users");
  const student = await students.query().withIndex("by_organization_and_externalId", q => q.eq("organizationId", orgId).eq("externalId", studentId)).unique();
  if (!student || (student.role !== "student" && !(student.role === "removed" && student.removedRole === "student"))) throw new Error("Student not found");
  const settings = await tenantTable(ctx, orgId, "tenantSettings").query().withIndex("by_organization", q => q.eq("organizationId", orgId)).unique();
  const timezone = settings?.timezone ?? "Asia/Almaty";
  const events = await tenantTable(ctx, orgId, "scheduleEvents").query().withIndex("by_organization_and_studentId", q => q.eq("organizationId", orgId).eq("studentId", studentId)).take(1000);
  const lessons = await tenantTable(ctx, orgId, "lessons").query().withIndex("by_organization_and_studentId", q => q.eq("organizationId", orgId).eq("studentId", studentId)).take(1000);
  const runs = await tenantTable(ctx, orgId, "payrollRuns").query().withIndex("by_organization", q => q.eq("organizationId", orgId)).take(1000);
  if ([events, lessons, runs].some(rows => rows.length === 1000)) throw new Error("History is too large for one cleanup. Contact support.");
  const now = Date.now();
  const selected = events.filter(event => !event.isDeleted && event.type === "1on1" &&
    (event.status === "cancelled" || wallTimeToMs(event.date, event.endTime, timezone) <= now) &&
    !lessons.some(lesson => !lesson.isDeleted && lesson.scheduleEventId === event._id && lesson.status === "recording"));
  const ids = new Set(selected.map(event => event._id));
  const selectedLessons = lessons.filter(lesson => !lesson.isDeleted && lesson.scheduleEventId && ids.has(lesson.scheduleEventId));
  const affectedRuns = runs.filter(run => run.lessonEventIds.some(id => ids.has(id)));
  const paidIds = new Set(affectedRuns.flatMap(run => run.lessonEventIds));
  // Detect changes between reviewing the confirmation and submitting it.
  const revision = JSON.stringify({ events: selected.map(e => [e._id, e.status, e.unpaid, e.cancellationCharged]), lessons: selectedLessons.map(l => [l._id, l.status]), runs: affectedRuns.map(r => [r._id, r.lessonEventIds, r.amount, r.amountBase]) });
  return { orgId, user, student, selected, selectedLessons, affectedRuns, ids, revision,
    unpaidPayable: selected.filter(e => isPayable(e) && !paidIds.has(e._id)).length };
}

export const preview = query({
  args: { studentId: v.string() },
  handler: async (ctx, { studentId }) => {
    const p = await plan(ctx, studentId);
    return { revision: p.revision, lessons: p.selected.length, sessions: p.selectedLessons.length,
      unpaidPayable: p.unpaidPayable,
      events: p.selected.map(e => ({ id: e._id, date: e.date, startTime: e.startTime, title: e.title, status: e.status })),
      payments: p.affectedRuns.map(run => ({ id: run._id, currency: run.currency,
        amount: Math.round((run.amount - Math.round(run.amount * run.lessonEventIds.filter(id => !p.ids.has(id)).length / run.lessonEventIds.length * 100) / 100) * 100) / 100 })) };
  },
});

export const clear = mutation({
  args: { studentId: v.string(), revision: v.string(), confirmation: v.string() },
  handler: async (ctx, { studentId, revision, confirmation }) => {
    const p = await plan(ctx, studentId);
    if (confirmation.trim() !== p.student.email) throw new Error("Enter the student's email to confirm");
    if (revision !== p.revision) throw new Error("Lesson history or payroll changed. Review the updated confirmation.");
    const events = tenantTable(ctx, p.orgId, "scheduleEvents");
    const lessons = tenantTable(ctx, p.orgId, "lessons");
    for (const event of p.selected) await events.patch(event._id, { isDeleted: true, deletedAt: new Date().toISOString() });
    for (const lesson of p.selectedLessons) await lessons.softDelete(lesson._id, p.user.externalId);
    const runs = tenantTable(ctx, p.orgId, "payrollRuns");
    const ledger = tenantTable(ctx, p.orgId, "financeEntries");
    for (const run of p.affectedRuns) {
      const remaining = run.lessonEventIds.filter(id => !p.ids.has(id));
      const entry = await ledger.query().withIndex("by_organization_and_sourceKey", q => q.eq("organizationId", p.orgId).eq("sourceKey", `payroll:${run._id}`)).unique();
      if (!remaining.length) {
        if (entry) await ledger.delete(entry._id);
        await runs.delete(run._id);
      } else {
        // Retain the historical payment's currency/rate snapshot, never today's FX.
        const ratio = remaining.length / run.lessonEventIds.length;
        const round = (n: number) => Math.round(n * ratio * 100) / 100;
        await runs.patch(run._id, { lessonEventIds: remaining, lessonCount: remaining.length, amount: round(run.amount), amountBase: run.amountBase === undefined ? undefined : round(run.amountBase) });
        if (entry) await ledger.patch(entry._id, { amount: round(entry.amount), amountBase: round(entry.amountBase), note: `${entry.note ?? "Teacher payment"} · corrected after test lesson cleanup` });
      }
    }
    await syncLessonTitles(ctx, p.orgId, studentId);
    return { lessons: p.selected.length };
  },
});
