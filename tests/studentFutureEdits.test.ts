import assert from "node:assert/strict";
import test from "node:test";
import { cancelVerdict, rescheduleVerdict } from "../convex/lib/policy";

const now = new Date("2026-10-08T05:00:00Z");
const event = { date: "2027-10-08", startTime: "10:00", status: "scheduled" };
test("students can cancel and move lessons a year away; teacher horizon remains", () => {
  const common = { event, now, orgTz: "Asia/Almaty" };
  const cancel = cancelVerdict({ ...common, actor: "student", studentRecentFreeCancels: 0, isFirstLessonWithStudent: false });
  assert.equal(cancel.allowed, true);
  assert.equal(cancel.refund, true);
  assert.equal(rescheduleVerdict({ ...common, actor: "student" }).allowed, true);
  assert.equal(rescheduleVerdict({ ...common, actor: "teacher" }).allowed, false);
});
test("unlimited student horizon preserves cancellation quota and late move charges", () => {
  const common = { event, now, orgTz: "Asia/Almaty", actor: "student" as const };
  assert.equal(cancelVerdict({ ...common, studentRecentFreeCancels: 2, isFirstLessonWithStudent: false }).refund, false);
  assert.equal(rescheduleVerdict({ ...common, event: { ...event, date: "2026-10-08", startTime: "12:00" } }).chargesLesson, true);
  assert.equal(rescheduleVerdict({ ...common, event: { ...event, date: "2026-10-08", startTime: "09:00" } }).allowed, false);
});
