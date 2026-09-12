import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import {
  billingOrderAdminLink,
  orderQueueDetails,
} from "../convex/lib/billingCatalogue.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

test("student billing has no legacy catalogue, package, or compatibility branch", () => {
  const page = fs.readFileSync(path.join(ROOT, "src/app/student/billing/page.tsx"), "utf8");
  const billing = fs.readFileSync(path.join(ROOT, "convex/billing.ts"), "utf8");
  const catalogue = fs.readFileSync(path.join(ROOT, "convex/lib/billingCatalogue.ts"), "utf8");
  for (const source of [page, billing, catalogue]) {
    assert.doesNotMatch(source, /legacy_adapter|LegacyCatalogue|legacyOffers|legacyClaims|compatibilityNotice|billingMode|pointPackages|paymentEvents/);
  }
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
      startsAt: "2026-09-01T00:00:00.000Z",
      endsAt: "2026-10-01T00:00:00.000Z",
      maxRedemptions: 10,
      redemptionCountAtCalculation: 2,
      validAt: "2026-09-12T10:00:00.000Z",
      calculatedAt: "2026-09-12T10:00:00.000Z",
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
      startsAt: "2026-09-01T00:00:00.000Z",
      endsAt: "2026-10-01T00:00:00.000Z",
      maxRedemptions: 10,
      redemptionCountAtCalculation: 2,
      validAt: "2026-09-12T10:00:00.000Z",
      calculatedAt: "2026-09-12T10:00:00.000Z",
    },
    rejectionReason: null,
  });
});

test("the mounted discount form omits empty optional localized fields", () => {
  const operations = fs.readFileSync(path.join(ROOT, "src/components/billing/BillingOperations.tsx"), "utf8");
  assert.match(operations, /labels: labelPayload\.default \? labelPayload : undefined/);
  assert.match(operations, /description: descriptionPayload\.default \? descriptionPayload : undefined/);
  assert.match(operations, /t\(row\.status === "draft" \? "draft"/);
  assert.doesNotMatch(operations, /\{row\.status\} · \{row\.visibility\}/);
});
test("the mounted admin surface has one live fulfilment control path", () => {
  const page = fs.readFileSync(path.join(ROOT, "src/app/admin/billing/page.tsx"), "utf8");
  const operations = fs.readFileSync(path.join(ROOT, "src/components/billing/BillingOperations.tsx"), "utf8");
  assert.doesNotMatch(page, /api\.points\.grantPoints|api\.payments\.confirmManualPayment|api\.payments\.recordTrialPayment/);
  assert.match(page, /<BillingOperations\s*\/>/);
  assert.match(operations, /function QueueOrder/);
  assert.match(operations, /discountSnapshot/);
  assert.doesNotMatch(operations, /confirmManualPayment|recordTrialPayment|points\.grantPoints/);
  assert.doesNotMatch(operations, /legacyPackages|legacyClaims|legacyReviews|adoptLegacy/);
});

test("the mounted billing route controls the commercial tab from notification links", () => {
  const page = fs.readFileSync(path.join(ROOT, "src/app/admin/billing/page.tsx"), "utf8");
  assert.match(page, /useSearchParams/);
  assert.match(page, /value=\{activeTab\}/);
  assert.match(page, /onValueChange=\{setActiveTab\}/);
  assert.match(page, /next\.delete\("order"\)/);
  assert.doesNotMatch(page, /<OrderQueueTab/);
});

test("legacy package schema, gateway modules, and direct purchase grants are removed", () => {
  const schema = fs.readFileSync(path.join(ROOT, "convex/schema.ts"), "utf8");
  const points = fs.readFileSync(path.join(ROOT, "convex/points.ts"), "utf8");
  const http = fs.readFileSync(path.join(ROOT, "convex/http.ts"), "utf8");
  const obsolete = /pointPackages|paymentEvents|billingLegacyReviews|billingRecords|priceMigrationAudit|legacyPointPackageId|legacyPaymentEventId|legacyGrantId|legacyPackageId|billingMode|lockedPriceTier|externalOrderId/;
  assert.doesNotMatch(schema, obsolete);
  assert.doesNotMatch(points, /export const grantPoints|pointPackages|packageId|externalOrderId/);
  assert.match(points, /export const grantLessonAdjustment/);
  assert.doesNotMatch(http, /lemonsqueezy|payments/);
  assert.equal(fs.existsSync(path.join(ROOT, "convex/payments.ts")), false);
  assert.equal(fs.existsSync(path.join(ROOT, "convex/billingMigration.ts")), false);
  assert.equal(fs.existsSync(path.join(ROOT, "src/app/student/billing/thanks/page.tsx")), false);
});
