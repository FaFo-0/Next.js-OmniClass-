import assert from "node:assert/strict";
import test from "node:test";
import { createWork, replaceUnits } from "../convex/libraryWorks.ts";

type Handler = { _handler(ctx: unknown, args: unknown): Promise<unknown> };

for (const operation of ["create", "replace"] as const) {
  test(`${operation} persists reading time on the saved unit`, async () => {
    const inserted: Array<{ table: string; row: Record<string, unknown> }> = [];
    const user = { externalId: "admin", organizationId: "org_3DIbJAWeR5CjVaBRlB4AZXL1UpD", role: "admin" };
    const chain = { withIndex: () => chain, unique: async () => user, collect: async () => [] };
    const ctx = {
      auth: { getUserIdentity: async () => ({ tokenIdentifier: "issuer|admin" }) },
      db: {
        query: () => chain,
        get: async () => ({ ...user, _id: "work" }),
        insert: async (table: string, row: Record<string, unknown>) => { inserted.push({ table, row }); return "work"; },
        delete: async () => {},
      },
    };
    const units = [{ title: "Long reading", contentMarkdown: "word ".repeat(800) }];
    if (operation === "create") {
      await (createWork as unknown as Handler)._handler(ctx, { title: "Reading", kind: "article", topicTags: [], units });
      assert.equal(inserted.find((r) => r.table === "libraryWorks")?.row.isPublished, false);
    } else {
      await (replaceUnits as unknown as Handler)._handler(ctx, { workId: "work", units });
    }
    assert.equal(inserted.find((r) => r.table === "libraryUnits")?.row.estimatedReadMinutes, 4);
  });
}
