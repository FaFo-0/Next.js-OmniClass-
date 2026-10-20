import assert from "node:assert/strict";
import test from "node:test";
import { fixture } from "./helpers/libraryFixture";
import { createWork, replaceUnits } from "../convex/libraryWorks.ts";

type Handler = { _handler(ctx: unknown, args: unknown): Promise<unknown> };

for (const operation of ["create", "replace"] as const) {
  test(`${operation} persists reading time on the saved unit`, async () => {
    const { ctx, rows, add } = fixture();
    const workId = operation === "replace" ? await add("libraryWorks", { title: "Reading", isPublished: false }) : undefined;
    const units = [{ title: "Long reading", contentMarkdown: "word ".repeat(800) }];
    if (operation === "create") {
      await (createWork as unknown as Handler)._handler(ctx, { title: "Reading", kind: "article", topicTags: [], units });
      assert.equal(rows.libraryWorks[0].isPublished, false);
    } else {
      await (replaceUnits as unknown as Handler)._handler(ctx, { workId, units });
    }
    assert.equal(rows.libraryUnits[0].estimatedReadMinutes, 4);
  });
}
