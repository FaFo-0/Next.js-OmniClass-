import assert from "node:assert/strict";
import test from "node:test";
import {
  CLEAN_BILLING_CATALOGUE,
  BILLING_RESET_SCOPED_TABLES,
  BILLING_RESET_TABLES,
  buildBillingResetPlan,
} from "../convex/lib/billingReset.ts";

test("clean billing reset manifest is Standard Tutoring then IELTS with the approved packs", () => {
  assert.deepEqual(
    CLEAN_BILLING_CATALOGUE.map((family) => ({
      key: family.key,
      label: family.labels.default,
      packs: family.packs.map((pack) => [pack.lessonCount, pack.price, pack.currency, pack.expiryDays]),
    })),
    [
      {
        key: "standard_tutoring",
        label: "Standard Tutoring",
        packs: [[4, 15000, "KZT", 60], [8, 26000, "KZT", 60], [12, 36000, "KZT", 60]],
      },
      {
        key: "ielts",
        label: "IELTS",
        packs: [[4, 20000, "KZT", 60], [8, 35000, "KZT", 60], [12, 48000, "KZT", 60]],
      },
    ],
  );
  for (const family of CLEAN_BILLING_CATALOGUE) {
    for (const pack of family.packs) {
      assert.equal(pack.benefits.length, 4);
      for (const benefit of pack.benefits) {
        assert.ok(benefit.default.trim());
        assert.ok(benefit.en?.trim());
        assert.ok(benefit.ru?.trim());
        assert.ok(benefit.ar?.trim());
        assert.ok(benefit.kk?.trim());
      }
    }
  }
});

test("billing reset plan only names the canonical model and scopes shared ledgers", () => {
  assert.deepEqual(BILLING_RESET_TABLES, [
    "billingDiscountRedemptions",
    "billingDiscountEligibleStudents",
    "billingDiscounts",
    "billingPlanBenefits",
    "billingPlanVersions",
    "billingPlans",
    "billingFamilies",
    "billingOrders",
    "pointGrants",
    "pointTransactions",
    "financeEntries",
    "notifications",
  ]);
  assert.deepEqual(BILLING_RESET_SCOPED_TABLES, ["pointGrants", "pointTransactions", "financeEntries", "notifications"]);

  const plan = buildBillingResetPlan("org-development", {
    billingFamilies: 2,
    billingPlans: 6,
    billingPlanVersions: 6,
    billingPlanBenefits: 24,
    billingDiscounts: 1,
    billingDiscountEligibleStudents: 2,
    billingDiscountRedemptions: 3,
    billingOrders: 4,
    pointGrants: 5,
    pointTransactions: 6,
    financeEntries: 4,
    notifications: 2,
    users: 3,
    scheduleEvents: 8,
    homework: 5,
  });
  assert.equal(plan.organizationId, "org-development");
  assert.equal(plan.deleteCount, 65);
  assert.deepEqual(plan.scopedTables, ["pointGrants", "pointTransactions", "financeEntries", "notifications"]);
  assert.deepEqual(plan.preservedTables, ["users", "scheduleEvents", "homework"]);
  assert.equal(plan.rows.billingOrders, 4);
});
