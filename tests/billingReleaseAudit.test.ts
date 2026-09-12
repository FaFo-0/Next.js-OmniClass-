import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  billingOrderAdminLink,
  orderQueueDetails,
  resolveBillingSurface,
} from "../convex/lib/billingCatalogue.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

test("billing rollout routes legacy tenants and empty catalogues through a labelled adapter", () => {
  assert.deepEqual(
    resolveBillingSurface({ billingMode: "legacy", versionedOfferCount: 2, legacyPackageCount: 2 }),
    { source: "legacy_adapter", showLegacyHistory: true, compatibilityLabel: "legacy" },
  );
  assert.deepEqual(
    resolveBillingSurface({ billingMode: "orders", versionedOfferCount: 0, legacyPackageCount: 2 }),
    { source: "legacy_adapter", showLegacyHistory: true, compatibilityLabel: "empty_catalogue" },
  );
  assert.deepEqual(
    resolveBillingSurface({ billingMode: "dual_read", versionedOfferCount: 2, legacyPackageCount: 2 }),
    { source: "versioned", showLegacyHistory: true, compatibilityLabel: "dual_read" },
  );
});

test("order notifications target the mounted commercial tab and preserve the exact order", () => {
  assert.equal(
    billingOrderAdminLink("order-123"),
    "/admin/billing?tab=commercial&order=order-123",
  );
});

test("queue details retain every immutable commercial field for admin rendering", () => {
  assert.deepEqual(orderQueueDetails({
    orderId: "order-1",
    buyerName: "Buyer",
    buyerStudentId: "student-1",
    requestedAt: "2026-09-12T10:00:00.000Z",
    status: "pending_verification",
    planSnapshot: { familyLabel: "IELTS", planLabel: "4 lessons", lessonCount: 4, expiryDays: 60 },
    priceSnapshot: { listAmount: 20000, discountAmount: 1000, netAmount: 19000, currency: "KZT", calculatedAt: "2026-09-12T10:00:00.000Z" },
    discountSnapshot: {
      discountId: "discount-1",
      name: "Launch",
      kind: "percent",
      value: 5,
      amount: 1000,
      currency: undefined,
      scope: "family",
      eligibility: "new_clients_only",
      priority: 1,
      validAt: "2026-09-12T10:00:00.000Z",
    },
    rejectionReason: null,
  }), {
    orderId: "order-1",
    buyerName: "Buyer",
    buyerStudentId: "student-1",
    requestedAt: "2026-09-12T10:00:00.000Z",
    status: "pending_verification",
    familyLabel: "IELTS",
    planLabel: "4 lessons",
    lessonCount: 4,
    expiryDays: 60,
    listAmount: 20000,
    discountAmount: 1000,
    netAmount: 19000,
    currency: "KZT",
    discount: {
      id: "discount-1",
      name: "Launch",
      kind: "percent",
      value: 5,
      amount: 1000,
      currency: undefined,
      scope: "family",
      eligibility: "new_clients_only",
      priority: 1,
      validAt: "2026-09-12T10:00:00.000Z",
    },
    rejectionReason: null,
  });
});

test("the mounted admin surface has one live fulfilment control path", () => {
  const page = fs.readFileSync(path.join(ROOT, "src/app/admin/billing/page.tsx"), "utf8");
  const operations = fs.readFileSync(path.join(ROOT, "src/components/billing/BillingOperations.tsx"), "utf8");
  assert.doesNotMatch(page, /api\.points\.grantPoints|api\.payments\.confirmManualPayment|api\.payments\.recordTrialPayment/);
  assert.match(page, /<BillingOperations\s*\/>/);
  assert.match(operations, /function QueueOrder/);
  assert.match(operations, /discountSnapshot/);
  assert.doesNotMatch(operations, /confirmManualPayment|recordTrialPayment|points\.grantPoints/);
});
