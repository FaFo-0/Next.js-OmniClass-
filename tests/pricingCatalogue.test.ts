import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCatalogue,
  findOffer,
  orderAdminLink,
  orderSnapshots,
  type CatalogueFamilyRow,
  type CataloguePackRow,
} from "../convex/lib/pricingCatalogue.ts";

const NOW = "2026-09-29T10:00:00.000Z";

const standard: CatalogueFamilyRow = {
  _id: "family-standard", label: "Standard Tutoring", labelEn: "Standard Tutoring", labelRu: "Стандартный английский",
  description: "Structured individual tutoring.", descriptionRu: "Структурированные занятия.",
  sortOrder: 0, isVisible: true, isArchived: false,
};
const ielts: CatalogueFamilyRow = {
  _id: "family-ielts", label: "IELTS", labelEn: "IELTS", labelRu: "IELTS",
  sortOrder: 1, isVisible: true, isArchived: false,
};

const packFour: CataloguePackRow = {
  _id: "pack-4", familyId: "family-standard", name: "4 lessons", nameEn: "4 lessons", nameRu: "4 урока",
  lessons: 4, currency: "KZT", price: 15_000, expiryDays: 60, benefits: [
    { default: "Structured 1-on-1 tutoring", en: "Structured 1-on-1 tutoring", ru: "Индивидуальные занятия" },
    { default: "Flexible booking", en: "Flexible booking", ru: "Гибкое бронирование" },
  ], sortOrder: 0, isVisible: true, isArchived: false,
};
const packEight: CataloguePackRow = {
  _id: "pack-8", familyId: "family-standard", name: "8 lessons", nameEn: "8 lessons", nameRu: "8 уроков",
  lessons: 8, currency: "KZT", price: 26_000, expiryDays: 60, benefits: [], sortOrder: 1, isVisible: true, isArchived: false,
};
const packIelts: CataloguePackRow = {
  _id: "pack-ielts-4", familyId: "family-ielts", name: "4 lessons", nameEn: "4 lessons", nameRu: "4 урока",
  lessons: 4, currency: "KZT", price: 20_000, expiryDays: 60, benefits: [{ default: "Exam strategy" }], sortOrder: 0, isVisible: true, isArchived: false,
};

function catalogue(overrides: Partial<Parameters<typeof buildCatalogue>[0]> = {}) {
  return buildCatalogue({
    locale: "en",
    now: NOW,
    families: [standard, ielts],
    packs: [packEight, packFour, packIelts],
    ...overrides,
  });
}

test("every offered family is exposed, in explicit order, with its own packs in order", () => {
  const groups = catalogue();
  assert.deepEqual(groups.map((group) => group.label), ["Standard Tutoring", "IELTS"]);
  assert.deepEqual(groups[0]?.packs.map((pack) => pack.name), ["4 lessons", "8 lessons"]);
  assert.deepEqual(groups[1]?.packs.map((pack) => pack.name), ["4 lessons"]);
  assert.deepEqual(Object.keys(groups[0]!.packs[0]!).sort(), [
    "benefits", "currency", "discountAmount", "expiryDays", "familyId", "familyLabel",
    "lessons", "listPrice", "name", "netPrice", "onSale", "packId",
  ]);
});

test("a pack with no sale price reports one price and no saving", () => {
  const offer = catalogue().at(0)!.packs.at(0)!;
  assert.equal(offer.onSale, false);
  assert.equal(offer.listPrice, 15_000);
  assert.equal(offer.netPrice, 15_000);
  assert.equal(offer.discountAmount, 0);
});

test("a sale price crosses out the base price and becomes the price paid", () => {
  const groups = catalogue({ packs: [{ ...packFour, salePrice: 12_000 }, packEight, packIelts] });
  const offer = groups.at(0)!.packs.at(0)!;
  assert.equal(offer.onSale, true);
  assert.equal(offer.listPrice, 15_000);
  assert.equal(offer.netPrice, 12_000);
  assert.equal(offer.discountAmount, 3_000);
});

test("a pack is omitted when it is hidden, archived, or inside a hidden family", () => {
  assert.deepEqual(catalogue({ packs: [{ ...packFour, isVisible: false }, packEight, packIelts] }).at(0)!.packs.map((pack) => pack.name), ["8 lessons"]);
  assert.deepEqual(catalogue({ packs: [{ ...packEight, isArchived: true }, packFour, packIelts] }).at(0)!.packs.map((pack) => pack.name), ["4 lessons"]);
  assert.deepEqual(catalogue({ families: [{ ...standard, isVisible: false }, ielts] }).map((group) => group.label), ["IELTS"]);
  assert.deepEqual(catalogue({ families: [{ ...ielts, isArchived: true }, standard] }).map((group) => group.label), ["Standard Tutoring"]);
});

test("a family with no offered packs is omitted rather than shown empty", () => {
  const groups = catalogue({ packs: [packEight, { ...packIelts, isVisible: false }] });
  assert.deepEqual(groups.map((group) => group.label), ["Standard Tutoring"]);
});

test("catalogue copy resolves to the locale, then English, then the default", () => {
  const russian = catalogue({ locale: "ru" });
  assert.equal(russian.at(0)?.label, "Стандартный английский");
  assert.equal(russian.at(0)?.description, "Структурированные занятия.");
  assert.equal(russian.at(0)?.packs.at(0)?.name, "4 урока");
  assert.deepEqual(russian.at(0)?.packs.at(0)?.benefits, ["Индивидуальные занятия", "Гибкое бронирование"]);

  // Arabic and Kazakh pricing copy fall back to English.
  const arabic = catalogue({ locale: "ar" });
  assert.equal(arabic.at(0)?.label, "Standard Tutoring");
  assert.equal(arabic.at(0)?.description, "Structured individual tutoring.");
  assert.equal(arabic.at(0)?.packs.at(0)?.name, "4 lessons");

  const english = catalogue({ locale: "en" });
  assert.equal(english.at(0)?.description, "Structured individual tutoring.");
});

test("order receipts carry the pack label, lesson count, and the price charged", () => {
  const offer = catalogue().at(0)!.packs.at(0)!;
  assert.deepEqual(orderSnapshots(offer, NOW), {
    planSnapshot: { familyLabel: "Standard Tutoring", planLabel: "4 lessons", lessonCount: 4, expiryDays: 60 },
    priceSnapshot: { listAmount: 15_000, discountAmount: 0, netAmount: 15_000, currency: "KZT", calculatedAt: NOW },
  });
});

test("an order receipt records only the price, never the pack it came from", () => {
  const offer = catalogue({ packs: [{ ...packFour, salePrice: 12_000 }, packEight, packIelts] }).at(0)!.packs.at(0)!;
  const { planSnapshot, priceSnapshot } = orderSnapshots(offer, NOW);
  assert.deepEqual(Object.keys(planSnapshot).sort(), ["expiryDays", "familyLabel", "lessonCount", "planLabel"]);
  assert.deepEqual(Object.keys(priceSnapshot).sort(), ["calculatedAt", "currency", "discountAmount", "listAmount", "netAmount"]);
  assert.equal(JSON.stringify({ planSnapshot, priceSnapshot }).includes("pack-4"), false);
});

test("an order notification opens the mounted commercial tab with the order selected", () => {
  assert.equal(orderAdminLink("order-123"), "/admin/billing?tab=commercial&order=order-123");
  assert.equal(orderAdminLink("order/1 2"), "/admin/billing?tab=commercial&order=order%2F1%202");
});

test("findOffer locates a pack across every family and returns null for an unknown id", () => {
  const groups = catalogue();
  assert.equal(findOffer(groups, "pack-ielts-4")?.familyLabel, "IELTS");
  assert.equal(findOffer(groups, "pack-missing"), null);
});
