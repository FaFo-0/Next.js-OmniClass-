/** Shared queue transitions. Text revisions and learner history remain independent. */
import type { MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import { internal } from "../_generated/api";
import { PREPARATION_VERSION } from "./libraryText";

export async function queueVocabulary(ctx: MutationCtx, unit: Doc<"libraryUnits">, reset = false): Promise<boolean> {
  if (!reset && unit.preparationState) return false;
  const rows = await ctx.db.query("libraryVocabularyBatches").withIndex("by_unitId_and_revision", q => q.eq("unitId", unit._id).eq("revision", unit.revision ?? 1)).collect();
  for (const row of rows) await ctx.db.delete(row._id);
  await ctx.db.patch(unit._id, {
    preparationState: "queued", preparationCursor: 0, preparationVersion: PREPARATION_VERSION,
    preparationRun: (unit.preparationRun ?? 0) + 1, preparationFailures: 0,
    preparationError: undefined, preparationLease: undefined, preparationRetryAt: undefined,
  });
  return true;
}

export async function wakePreparation(ctx: MutationCtx, organizationId: string) {
  await ctx.scheduler.runAfter(0, internal.libraryPreparation.dispatch, { organizationId });
}
