import assert from "node:assert/strict";
import test from "node:test";
import {
  localizeBillingText,
  normalizePresentation,
  sortCatalogueOffers,
  type CatalogueOfferForSort,
} from "../convex/lib/billingCatalogue.ts";

test("localized catalogue text falls back from locale to English to default", () => {
  assert.equal(localizeBillingText({ default: "Default", en: "English", ru: "Русский" }, "ru"), "Русский");
  assert.equal(localizeBillingText({ default: "Default", en: "English" }, "ar"), "English");
  assert.equal(localizeBillingText({ default: "Default", en: "" }, "kk"), "Default");
});

test("student offers use explicit family, plan, version and id tie-breakers", () => {
  const offers: CatalogueOfferForSort[] = [
    { id: "b", familySortOrder: 2, familyId: "family-b", planSortOrder: 1, planId: "plan-b", versionSortOrder: 1, version: 2 },
    { id: "a", familySortOrder: 1, familyId: "family-a", planSortOrder: 2, planId: "plan-a-2", versionSortOrder: 4, version: 1 },
    { id: "c", familySortOrder: 1, familyId: "family-a", planSortOrder: 1, planId: "plan-a-1", versionSortOrder: 2, version: 1 },
    { id: "d", familySortOrder: 1, familyId: "family-a", planSortOrder: 1, planId: "plan-a-1", versionSortOrder: 2, version: 1 },
  ];
  assert.deepEqual(sortCatalogueOffers(offers).map((offer) => offer.id), ["c", "d", "a", "b"]);
});

test("presentation config is allowlisted, deterministic and has accessible defaults", () => {
  assert.deepEqual(normalizePresentation({
    variant: "unknown",
    accent: "unsafe",
    featured: true,
    badge: { default: "Featured" },
    ctaLabel: { default: "Start" },
    sectionOrder: ["price", "price", "unknown", "benefits", "family"],
    sections: { family: false, benefits: true },
  }), {
    variant: "standard",
    accent: "purple",
    featured: true,
    badge: { default: "Featured" },
    ctaLabel: { default: "Start" },
    sectionOrder: ["price", "benefits", "family", "lessons", "expiry"],
    sections: { family: true, description: true, price: true, lessons: true, expiry: true, benefits: true, badge: true },
  });
});
