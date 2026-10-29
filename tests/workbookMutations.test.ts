import test from "node:test";
import assert from "node:assert/strict";
import { submit, updateContent, setApproved } from "../convex/homework";
import { ACADEMY_ID } from "../convex/lib/tenant";
import { newWorkbookSection } from "../convex/lib/workbook";
import type { MutationCtx } from "../convex/_generated/server";
import type { Id } from "../convex/_generated/dataModel";

const id = "homework" as Id<"homework">;
type Handler<A> = { _handler(ctx: MutationCtx, args: A): Promise<unknown> };
function fixture(role: "student" | "teacher") {
  const s = newWorkbookSection("gaps", "s"); s.instructions = "Complete.";
  s.items[0] = { ...s.items[0], prompt: "She ___ here. (work)", accepted: ["works"] };
  const row = { _id: id, organizationId: ACADEMY_ID, teacherId: "teacher", studentId: "student", title: "Practice", status: "assigned", approvedAt: "approved", contentJson: { type: "doc", content: [{ type: "workbookSection", attrs: s }] } };
  const user = { role, externalId: role, organizationId: ACADEMY_ID, tokenIdentifier: `issuer|${role}` };
  const notifications: unknown[] = [];
  const ctx = {
    auth: { async getUserIdentity() { return { tokenIdentifier: user.tokenIdentifier }; } },
    db: {
      query() { const q = { withIndex() { return q; }, async unique() { return user; } }; return q; },
      async get() { return row; },
      async patch(_id: string, patch: object) { Object.assign(row, patch); },
      async insert(_table: string, data: unknown) { notifications.push(data); return "notification"; },
    },
  } as unknown as MutationCtx;
  return { ctx, row, notifications };
}

test("submission atomically captures final local answers while preserving teacher keys", async () => {
  const f = fixture("student"), incoming = structuredClone(f.row.contentJson);
  incoming.content[0].attrs.items[0].answer = "works";
  incoming.content[0].attrs.items[0].accepted = ["forged"];
  await (submit as unknown as Handler<{ id: Id<"homework">; contentJson: unknown }>)._handler(f.ctx, { id, contentJson: incoming });
  assert.equal(f.row.status, "submitted");
  assert.equal(f.row.contentJson.content[0].attrs.items[0].answer, "works");
  assert.deepEqual(f.row.contentJson.content[0].attrs.items[0].accepted, ["works"]);
  assert.equal(f.notifications.length, 1);
  await assert.rejects(() => (updateContent as unknown as Handler<{ id: Id<"homework">; contentJson: unknown }>)._handler(f.ctx, { id, contentJson: incoming }), /not editable/);
});

test("teacher draft edits invalidate approval and cannot overwrite student work", async () => {
  const f = fixture("teacher");
  await assert.rejects(() => (updateContent as unknown as Handler<{ id: Id<"homework">; contentJson: unknown }>)._handler(f.ctx, { id, contentJson: {} }), /Only draft/);
  f.row.status = "draft";
  await (updateContent as unknown as Handler<{ id: Id<"homework">; contentJson: unknown }>)._handler(f.ctx, { id, contentJson: f.row.contentJson });
  assert.equal(f.row.approvedAt, undefined);
  f.row.contentJson.content[0].attrs.instructions = "";
  await assert.rejects(() => (setApproved as unknown as Handler<{ id: Id<"homework">; approved: boolean }>)._handler(f.ctx, { id, approved: true }), /instructions/);
  f.row.contentJson.content[0].attrs.instructions = "Use the present simple.";
  await (setApproved as unknown as Handler<{ id: Id<"homework">; approved: boolean }>)._handler(f.ctx, { id, approved: true });
  assert.ok(f.row.approvedAt);
});
