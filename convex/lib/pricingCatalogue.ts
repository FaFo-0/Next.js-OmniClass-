// Pure catalogue projection shared by the student, public, and admin read
// models. Grouping and price resolution live here so both surfaces and the
// tests agree on one shape.

import {
  localizePricingText,
  packIsOffered,
  resolvePackPrice,
  sortFamilies,
  sortPacks,
  type PricingLocale,
  type PricingText,
} from "./pricing";

export type CatalogueFamilyRow = {
  _id: unknown;
  label: string;
  labelEn?: string;
  labelRu?: string;
  labelKk?: string;
  description?: string;
  descriptionEn?: string;
  descriptionRu?: string;
  descriptionKk?: string;
  sortOrder: number;
  isVisible: boolean;
  /** Show this family on the public website. Undefined means shown. */
  showOnWebsite?: boolean;
  isArchived: boolean;
};

export type CataloguePackRow = {
  _id: unknown;
  familyId: unknown;
  name: string;
  nameEn?: string;
  nameRu?: string;
  nameKk?: string;
  lessons: number;
  currency: string;
  price: number;
  salePrice?: number;
  saleEndsAt?: string;
  expiryDays: number;
  benefits: PricingText[];
  sortOrder: number;
  isVisible: boolean;
  isArchived: boolean;
};

export type CataloguePackOffer = {
  packId: string;
  familyId: string;
  familyLabel: string;
  name: string;
  lessons: number;
  currency: string;
  listPrice: number;
  netPrice: number;
  discountAmount: number;
  onSale: boolean;
  expiryDays: number;
  benefits: string[];
};

export type CatalogueFamilyGroup = {
  familyId: string;
  label: string;
  description: string | null;
  packs: CataloguePackOffer[];
};

const EMPTY: PricingText = { default: "" };

function familyText(row: CatalogueFamilyRow): PricingText {
  return { default: row.label, en: row.labelEn, ru: row.labelRu, kk: row.labelKk };
}

function familyDescriptionText(row: CatalogueFamilyRow): PricingText {
  return { default: row.description ?? "", en: row.descriptionEn, ru: row.descriptionRu, kk: row.descriptionKk };
}

function packText(row: CataloguePackRow): PricingText {
  return { default: row.name, en: row.nameEn, ru: row.nameRu, kk: row.nameKk };
}

export function familyLabel(row: CatalogueFamilyRow, locale: PricingLocale): string {
  return localizePricingText(familyText(row), locale);
}

export function familyDescription(row: CatalogueFamilyRow, locale: PricingLocale): string | null {
  return localizePricingText(familyDescriptionText(row), locale) || null;
}

export function packName(row: CataloguePackRow, locale: PricingLocale): string {
  return localizePricingText(packText(row), locale);
}

export function offerForPack(
  family: CatalogueFamilyRow,
  pack: CataloguePackRow,
  locale: PricingLocale,
  now: string,
): CataloguePackOffer {
  const price = resolvePackPrice(pack, pack.currency, now);
  const label = familyLabel(family, locale);
  return {
    packId: String(pack._id),
    familyId: String(family._id),
    familyLabel: label,
    name: packName(pack, locale),
    lessons: pack.lessons,
    currency: pack.currency,
    listPrice: price.listAmount,
    netPrice: price.netAmount,
    discountAmount: price.discountAmount,
    onSale: price.onSale,
    expiryDays: pack.expiryDays,
    benefits: (pack.benefits ?? [])
      .map((benefit) => localizePricingText(benefit ?? EMPTY, locale))
      .filter((text) => text.length > 0),
  };
}

/**
 * Every offered family, in explicit order, each with its offered packs. An
 * empty family is omitted rather than rendered as an empty heading. With
 * `publicOnly`, a family switched off for the website is skipped — the student
 * portal still shows it.
 */
export function buildCatalogue({
  locale,
  now,
  families,
  packs,
  publicOnly = false,
}: {
  locale: PricingLocale;
  now: string;
  families: CatalogueFamilyRow[];
  packs: CataloguePackRow[];
  publicOnly?: boolean;
}): CatalogueFamilyGroup[] {
  const groups: CatalogueFamilyGroup[] = [];
  const offered = families.filter((row) => packIsOffered(row) && (!publicOnly || row.showOnWebsite !== false));
  for (const family of sortFamilies(offered)) {
    const familyPacks = sortPacks(packs.filter((pack) => String(pack.familyId) === String(family._id) && packIsOffered(pack)));
    if (familyPacks.length === 0) continue;
    groups.push({
      familyId: String(family._id),
      label: familyLabel(family, locale),
      description: familyDescription(family, locale),
      packs: familyPacks.map((pack) => offerForPack(family, pack, locale, now)),
    });
  }
  return groups;
}

export function findOffer(groups: CatalogueFamilyGroup[], packId: string): CataloguePackOffer | null {
  for (const group of groups) {
    const offer = group.packs.find((pack) => pack.packId === packId);
    if (offer) return offer;
  }
  return null;
}

/** Where an order notification sends the admin, with the order pre-selected. */
export function orderAdminLink(orderId: string): string {
  return `/admin/billing?tab=commercial&order=${encodeURIComponent(orderId)}`;
}

export type OrderSnapshot = {
  familyLabel: string;
  planLabel: string;
  lessonCount: number;
  expiryDays: number;
};

export type PriceSnapshot = {
  listAmount: number;
  discountAmount: number;
  netAmount: number;
  currency: string;
  calculatedAt: string;
};

/** Immutable order provenance written at request time and never recomputed. */
export function orderSnapshots(
  offer: CataloguePackOffer,
  now: string,
): { planSnapshot: OrderSnapshot; priceSnapshot: PriceSnapshot } {
  return {
    planSnapshot: {
      familyLabel: offer.familyLabel,
      planLabel: offer.name,
      lessonCount: offer.lessons,
      expiryDays: offer.expiryDays,
    },
    priceSnapshot: {
      listAmount: offer.listPrice,
      discountAmount: offer.discountAmount,
      netAmount: offer.netPrice,
      currency: offer.currency,
      calculatedAt: now,
    },
  };
}
