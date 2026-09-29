import assert from "node:assert/strict";
import test from "node:test";
import {
  isSaleActive,
  localizePricingText,
  neighbourToSwap,
  nextSortOrder,
  packIsOffered,
  resolvePackPrice,
  sortPacks,
  validatePackPricing,
} from "../convex/lib/pricing.ts";

const NOW = "2026-09-29T10:00:00.000Z";

test("a sale price wins while it is lower than the price", () => {
  const resolved = resolvePackPrice({ price: 26_000, salePrice: 21_000 }, "KZT", NOW);
  assert.deepEqual(resolved, {
    onSale: true,
    listAmount: 26_000,
    netAmount: 21_000,
    discountAmount: 5_000,
  });
});

test("a pack without a sale price shows exactly one price", () => {
  assert.deepEqual(resolvePackPrice({ price: 26_000 }, "KZT", NOW), {
    onSale: false,
    listAmount: 26_000,
    netAmount: 26_000,
    discountAmount: 0,
  });
});

test("a sale price that is not lower is rejected on save", () => {
  assert.throws(() => validatePackPricing({ price: 26_000, salePrice: 26_000 }), /lower than the price/);
  assert.throws(() => validatePackPricing({ price: 26_000, salePrice: 30_000 }), /lower than the price/);
  assert.throws(() => validatePackPricing({ price: 26_000, salePrice: 21_000, saleEndsAt: "not-a-date" }), /end date is invalid/);
  assert.throws(() => validatePackPricing({ price: -1 }), /zero or more/);
  assert.doesNotThrow(() => validatePackPricing({ price: 26_000, salePrice: 21_000, saleEndsAt: "2026-10-05T00:00:00.000Z" }));
});

test("an expired sale window renders the plain price", () => {
  const expired = { price: 26_000, salePrice: 21_000, saleEndsAt: "2026-09-28T00:00:00.000Z" };
  assert.equal(isSaleActive(expired, NOW), false);
  assert.deepEqual(resolvePackPrice(expired, "KZT", NOW), {
    onSale: false,
    listAmount: 26_000,
    netAmount: 26_000,
    discountAmount: 0,
  });
  assert.equal(isSaleActive({ ...expired, saleEndsAt: "2026-10-28T00:00:00.000Z" }, NOW), true);
});

test("a sale window never decides whether a pack is offered", () => {
  assert.equal(packIsOffered({ isVisible: true, isArchived: false }), true);
  assert.equal(packIsOffered({ isVisible: false, isArchived: false }), false);
  assert.equal(packIsOffered({ isVisible: true, isArchived: true }), false);
  const expiredSale = { price: 26_000, salePrice: 21_000, saleEndsAt: "2026-01-01T00:00:00.000Z" };
  assert.equal(isSaleActive(expiredSale, NOW), false);
  assert.equal(packIsOffered({ isVisible: true, isArchived: false }), true);
});

test("pricing copy falls back from the requested locale to English to default", () => {
  const text = { default: "8 lessons", en: "8 lessons", ru: "8 уроков" };
  assert.equal(localizePricingText(text, "ru"), "8 уроков");
  assert.equal(localizePricingText(text, "en"), "8 lessons");
  assert.equal(localizePricingText(text, "ar"), "8 lessons");
  assert.equal(localizePricingText(text, "kk"), "8 lessons");
  assert.equal(localizePricingText({ default: "Fallback" }, "ru"), "Fallback");
  assert.equal(localizePricingText({ default: "Base", en: "English" }, "ru"), "English");
});

test("display order is explicit data, and a one-step move swaps neighbours", () => {
  const rows = [
    { _id: "c", sortOrder: 2 },
    { _id: "a", sortOrder: 0 },
    { _id: "b", sortOrder: 1 },
  ];
  assert.deepEqual(sortPacks(rows).map((row) => row._id), ["a", "b", "c"]);
  assert.equal(nextSortOrder(rows), 3);

  const ordered = sortPacks(rows);
  const down = neighbourToSwap(ordered, "a", 1);
  assert.deepEqual(down?.map((row) => row._id), ["a", "b"]);
  const up = neighbourToSwap(ordered, "b", -1);
  assert.deepEqual(up?.map((row) => row._id), ["b", "a"]);
  assert.equal(neighbourToSwap(ordered, "a", -1), null);
  assert.equal(neighbourToSwap(ordered, "c", 1), null);
  assert.equal(neighbourToSwap(ordered, "missing", 1), null);
});
