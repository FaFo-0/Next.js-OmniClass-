import assert from "node:assert/strict";
import test from "node:test";
import { notificationContractIssues, notificationViewForLocale } from "../convex/lib/notificationRegistry.ts";

test("billing order notifications are valid for admins and all learner locales", () => {
  const payload = { studentName: "Student A", familyLabel: "Basic Tutoring", planLabel: "4 lessons", lessons: 4, amount: 15000, currency: "KZT" };
  assert.deepEqual(notificationContractIssues("billing_order_requested", payload, "admin"), []);
  for (const locale of ["en", "ru", "ar", "kk"] as const) {
    const view = notificationViewForLocale("billing_order_requested", payload, locale);
    assert.notEqual(view.title, "billing_order_requested");
    assert.ok(view.body.length > 0);
  }
});

test("rejected billing orders are learner-visible with a readable reason", () => {
  const payload = { planLabel: "4 lessons", reason: "Payment was not verified" };
  assert.deepEqual(notificationContractIssues("billing_order_rejected", payload, "student"), []);
});
