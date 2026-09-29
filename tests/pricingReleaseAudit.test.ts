import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { orderAdminLink } from "../convex/lib/pricingCatalogue.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), "utf8");

test("the retired versioned catalogue, discount engine, and their editor are gone", () => {
  for (const retired of [
    "convex/billing.ts",
    "convex/billingDevelopmentReset.ts",
    "convex/lib/billingCatalogue.ts",
    "convex/lib/billingDiscounts.ts",
    "convex/lib/billingReset.ts",
    "convex/lib/publicCatalogue.ts",
    "src/components/billing/BillingOperations.tsx",
  ]) {
    assert.equal(fs.existsSync(path.join(ROOT, retired)), false, `${retired} should be deleted`);
  }
});

test("no live surface still reads a versioned or discount-based catalogue", () => {
  const sources = [
    read("convex/pricing.ts"),
    read("src/app/student/billing/page.tsx"),
    read("src/app/landing-page-client.tsx"),
    read("src/components/billing/PackEditor.tsx"),
  ];
  for (const source of sources) {
    assert.doesNotMatch(source, /billingPlanVersions|publicationScope|billingDiscounts|billingDiscountRedemptions|pointPackages|paymentEvents|legacy_adapter/);
  }
});

test("the student billing page reads the pricing catalogue with the active locale", () => {
  const page = read("src/app/student/billing/page.tsx");
  assert.match(page, /api\.pricing\.getStudentCatalogue, \{ locale \}/);
  assert.match(page, /api\.pricing\.createOrderRequest/);
  assert.match(page, /StudentPlanCard/);
});

test("the mounted admin surface is one pricing editor with one fulfilment path", () => {
  const page = read("src/app/admin/billing/page.tsx");
  assert.match(page, /<PackEditor \/>/);
  assert.doesNotMatch(page, /BillingOperations/);

  const editor = read("src/components/billing/PackEditor.tsx");
  assert.match(editor, /api\.pricing\.savePack/);
  assert.match(editor, /api\.pricing\.grantOrder/);
  assert.match(editor, /api\.pricing\.grantLessonsToStudent/);
});

test("the editor offers no draft, version, publish, or price-lock control", () => {
  const editor = read("src/components/billing/PackEditor.tsx");
  for (const retired of ["publishVersion", "saveVersion", "savePlanVersionDraft", "publicationScope", "newDraft", "saveBenefits"]) {
    assert.doesNotMatch(editor, new RegExp(retired), `${retired} should not exist`);
  }
  const pricing = read("convex/pricing.ts");
  assert.doesNotMatch(pricing, /planVersionId:\s*v\.id|publicationScope|new_clients_only|replace_for_everyone/);
});

test("order notifications open the mounted pricing tab with the order selected", () => {
  assert.equal(orderAdminLink("order-123"), "/admin/billing?tab=commercial&order=order-123");
  assert.match(read("convex/lib/notificationRegistry.ts"), /orderAdminLink as billingOrderAdminLink/);
});

test("a price change is a single save with no publication decision", () => {
  const pricing = read("convex/pricing.ts");
  const savePack = pricing.match(/export const savePack = mutation\(\{[\s\S]*?\n\}\);/)?.[0] ?? "";
  assert.match(savePack, /listPrice|price: args\.price/);
  assert.doesNotMatch(savePack, /status|publish|version/);

  const editor = read("src/components/billing/PackEditor.tsx");
  assert.match(editor, /t\("packSaved"\)/);
  assert.match(editor, /t\("packCreated"\)/);
});

test("legacy pricing tables stay readable until a verified readback removes them", () => {
  const schema = read("convex/schema.ts");
  for (const table of ["billingFamilies", "billingPlans", "billingPlanVersions", "billingPlanBenefits", "billingDiscounts", "billingOrders"]) {
    assert.match(schema, new RegExp(`${table}: defineTable`), `${table} must stay readable for stored production rows`);
  }
  assert.match(schema, /packFamilies: defineTable\(\{/);
  assert.match(schema, /^\s{2}packs: defineTable\(\{/m);
});
