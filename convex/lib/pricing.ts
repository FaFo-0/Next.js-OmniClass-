// Pure pricing rules shared by the Convex read models, the seed, and UI tests.
//
// One pack row carries one price. An optional sale price is the only discount
// mechanism: there is no versioning, no price lock, no stacking, and no
// per-student exception. Changing a price changes it for every student.

export type PricingLocale = "en" | "ru" | "ar" | "kk";

/** Pricing copy is authored in English, Russian and Kazakh; Arabic falls back. */
export type PricingText = {
  default: string;
  en?: string;
  ru?: string;
  kk?: string;
};

export type PackPricing = {
  price: number;
  salePrice?: number | null;
  saleEndsAt?: string | null;
};

export type ResolvedPackPrice = {
  onSale: boolean;
  listAmount: number;
  netAmount: number;
  discountAmount: number;
};

export function requiredText(value: string, label: string): string {
  const result = value.trim();
  if (!result) throw new Error(`${label} is required`);
  return result;
}

export function optionalText(value?: string | null): string | undefined {
  const result = value?.trim();
  return result ? result : undefined;
}

export function normalizedPricingText(value: PricingText, label: string): PricingText {
  const normalized: PricingText = { default: requiredText(value.default, label) };
  const english = optionalText(value.en);
  const russian = optionalText(value.ru);
  const kazakh = optionalText(value.kk);
  if (english) normalized.en = english;
  if (russian) normalized.ru = russian;
  if (kazakh) normalized.kk = kazakh;
  return normalized;
}

/**
 * Pricing text resolves requested locale -> English -> default. Arabic retains
 * its English fallback until Arabic pricing copy is authored.
 */
export function localizePricingText(value: PricingText, locale: PricingLocale): string {
  if (locale === "en" || locale === "ru" || locale === "kk") {
    const requested = optionalText(value[locale]);
    if (requested) return requested;
  }
  const english = optionalText(value.en);
  if (english) return english;
  return value.default.trim();
}

function moneyDigits(currency: string): number {
  // Launch catalogue currencies are quoted in whole units. Anything else uses
  // the conventional two minor-unit places.
  return currency === "KZT" || currency === "SAR" || currency === "JPY" ? 0 : 2;
}

export function roundMoney(value: number, currency: string): number {
  const factor = 10 ** moneyDigits(currency);
  return Math.round(value * factor) / factor;
}

export function validCurrency(value: string): string {
  const currency = requiredText(value, "Currency").toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("Currency must be a three-letter code");
  return currency;
}

export function validSortOrder(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
    throw new Error("Sort order must be a non-negative integer");
  }
  return value;
}

export function validatePackPricing(pack: PackPricing): void {
  if (!Number.isFinite(pack.price) || pack.price < 0) throw new Error("Price must be zero or more");
  if (pack.salePrice === undefined || pack.salePrice === null) return;
  if (!Number.isFinite(pack.salePrice) || pack.salePrice < 0) throw new Error("Sale price must be zero or more");
  if (pack.salePrice >= pack.price) throw new Error("Sale price must be lower than the price");
  const endsAt = optionalText(pack.saleEndsAt);
  if (endsAt && !Number.isFinite(Date.parse(endsAt))) throw new Error("Sale end date is invalid");
}

/** A sale is live only while it is cheaper than the price and inside its window. */
export function isSaleActive(pack: PackPricing, now: string): boolean {
  if (pack.salePrice === undefined || pack.salePrice === null) return false;
  if (!Number.isFinite(pack.salePrice) || pack.salePrice >= pack.price) return false;
  const endsAt = optionalText(pack.saleEndsAt);
  if (endsAt && Date.parse(endsAt) <= Date.parse(now)) return false;
  return true;
}

export function resolvePackPrice(pack: PackPricing, currency: string, now: string): ResolvedPackPrice {
  const listAmount = roundMoney(pack.price, currency);
  if (!isSaleActive(pack, now)) {
    return { onSale: false, listAmount, netAmount: listAmount, discountAmount: 0 };
  }
  const netAmount = roundMoney(pack.salePrice as number, currency);
  return {
    onSale: true,
    listAmount,
    netAmount,
    discountAmount: Math.max(0, roundMoney(listAmount - netAmount, currency)),
  };
}

/**
 * A pack is offered when it is switched on and not archived. A sale window
 * only ever changes the price, never whether the pack is buyable.
 */
export function packIsOffered(pack: { isVisible: boolean; isArchived: boolean }): boolean {
  return pack.isVisible && !pack.isArchived;
}

function bySortOrder<T extends { sortOrder: number; _id: unknown }>(a: T, b: T): number {
  return a.sortOrder - b.sortOrder || String(a._id).localeCompare(String(b._id));
}

export function sortFamilies<T extends { sortOrder: number; _id: unknown }>(rows: T[]): T[] {
  return [...rows].sort(bySortOrder);
}

export function sortPacks<T extends { sortOrder: number; _id: unknown }>(rows: T[]): T[] {
  return [...rows].sort(bySortOrder);
}

export function nextSortOrder(rows: { sortOrder: number }[]): number {
  return rows.reduce((next, row) => Math.max(next, row.sortOrder + 1), 0);
}

/**
 * The two rows whose sort order should be swapped for a one-step move, or null
 * when the row is already at the end of its list.
 */
export function neighbourToSwap<T extends { _id: unknown }>(
  ordered: T[],
  id: string,
  direction: -1 | 1,
): [T, T] | null {
  const index = ordered.findIndex((row) => String(row._id) === id);
  if (index === -1) return null;
  const neighbour = ordered[index + direction];
  if (!neighbour) return null;
  return [ordered[index]!, neighbour];
}
