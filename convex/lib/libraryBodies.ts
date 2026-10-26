/** Keep large chapter text out of navigation and queue transactions. */
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

export async function withUnitBody(ctx: Pick<QueryCtx, "db">, unit: Doc<"libraryUnits">): Promise<Doc<"libraryUnits">> {
  if (!unit.bodyId) return unit; // Existing chapters stay readable during migration.
  const body = await ctx.db.get(unit.bodyId);
  if (!body || body.organizationId !== unit.organizationId) throw new Error("Chapter text unavailable");
  return { ...unit, contentMarkdown: body.contentMarkdown, contentHtml: body.contentHtml };
}

export async function storeUnitBody(ctx: MutationCtx, unit: Doc<"libraryUnits">) {
  if (unit.bodyId) return;
  const bodyId = await ctx.db.insert("libraryUnitBodies", {
    organizationId: unit.organizationId, contentMarkdown: unit.contentMarkdown, contentHtml: unit.contentHtml,
  });
  await ctx.db.patch(unit._id, { bodyId, contentMarkdown: "", contentHtml: undefined });
}
