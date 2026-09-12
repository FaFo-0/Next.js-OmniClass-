import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateDiscount,
  selectBestDiscount,
  validateDiscount,
  type BillingDiscountRule,
} from "../convex/lib/billingDiscounts.ts";

const baseRule: BillingDiscountRule = {
  id: "discount-1",
  name: "Launch offer",
  kind: "percent",
  value: 10,
  scope: "all_plans",
  eligibility: "everyone",
  priority: 10,
  startsAt: "2026-09-01T00:00:00.000Z",
  endsAt: "2026-10-01T00:00:00.000Z",
  isActive: true,
  redemptionCount: 0,
};

test("discount matching respects scope and the half-open validity window", () => {
  const eligible = selectBestDiscount(
    [baseRule],
    { familyId: "family-basic", planId: "plan-4", currency: "KZT", isNewClient: true, allowlisted: false },
    "2026-09-30T23:59:59.999Z",
  );
  assert.equal(eligible?.id, "discount-1");
  assert.equal(selectBestDiscount([baseRule], { familyId: "other", planId: "other", currency: "KZT", isNewClient: true, allowlisted: false }, "2026-10-01T00:00:00.000Z"), null);
});

test("best-match selection is deterministic and never stacks rules", () => {
  const fixed: BillingDiscountRule = { ...baseRule, id: "discount-fixed", kind: "fixed", value: 3000, priority: 5, currency: "KZT" };
  const best = selectBestDiscount(
    [baseRule, fixed],
    { familyId: "family-basic", planId: "plan-4", currency: "KZT", isNewClient: true, allowlisted: false },
    "2026-09-10T00:00:00.000Z",
    15000,
  );
  assert.equal(best?.id, "discount-fixed");
  assert.deepEqual(calculateDiscount(15000, "KZT", best), { discountAmount: 3000, netAmount: 12000 });
});

test("percent discounts round once and fixed discounts require the same currency", () => {
  assert.deepEqual(calculateDiscount(999, "KZT", { ...baseRule, value: 12.5 }), { discountAmount: 125, netAmount: 874 });
  assert.throws(() => validateDiscount({ ...baseRule, value: 101 }), /percent/i);
  assert.throws(() => calculateDiscount(1000, "KZT", { ...baseRule, kind: "fixed", currency: "USD" }), /currency/);
  assert.throws(() => validateDiscount({ ...baseRule, startsAt: "2026-10-01T00:00:00.000Z", endsAt: "2026-09-01T00:00:00.000Z" }), /date/);
});

test("allowlist and new-client eligibility are enforced server-side", () => {
  const allowlist: BillingDiscountRule = { ...baseRule, id: "allow", eligibility: "allowlist" };
  const newOnly: BillingDiscountRule = { ...baseRule, id: "new", eligibility: "new_clients_only" };
  const ctx = { familyId: "family-basic", planId: "plan-4", currency: "KZT", isNewClient: false, allowlisted: false };
  assert.equal(selectBestDiscount([allowlist], ctx, "2026-09-10T00:00:00.000Z"), null);
  assert.equal(selectBestDiscount([newOnly], ctx, "2026-09-10T00:00:00.000Z"), null);
});

test("discount definitions reject unsafe priority and redemption limits", () => {
  assert.throws(() => validateDiscount({ ...baseRule, priority: -1 }), /priority/i);
  assert.throws(() => validateDiscount({ ...baseRule, maxRedemptions: 1_000_000_001 }), /maximum|limit/i);
});
