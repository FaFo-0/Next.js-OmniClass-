import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import type { Permission } from "./permissions";
import { requireTenantPermission, tenantTable } from "./tenant";

/**
 * Authorize a mutation on a specific lesson. `lessons.view.any` is deliberately
 * not an edit override: ordinary teachers have it for calendar visibility.
 * Editing transcript, vocabulary, or publish state remains the assigned
 * teacher's responsibility, with an explicit admin override.
 */
export async function requireLessonOwnerOrAdmin(
  ctx: MutationCtx,
  lessonId: Id<"lessons">,
  permission: Permission = "lessons.edit"
) {
  const { orgId, user } = await requireTenantPermission(ctx, permission);
  const lessons = tenantTable(ctx, orgId, "lessons");
  const lesson = await lessons.get(lessonId);
  if (!lesson) throw new Error("Lesson not found");
  if (lesson.teacherId !== user.externalId && user.role !== "admin") {
    throw new Error("Access denied: only the assigned teacher or an admin can change this lesson");
  }
  return { orgId, user, lesson, lessons };
}
