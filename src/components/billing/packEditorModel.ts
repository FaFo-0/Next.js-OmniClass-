import { zonedToInstant } from "../../lib/tz";
import type { PricingText } from "../../../convex/lib/pricing";
export type FamilyRow = {
  _id: string;
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
  /** Hidden families still sell inside the portal. Undefined means shown. */
  showOnWebsite?: boolean;
  isArchived: boolean;
};

export type PackForm = {
  id?: string;
  familyId: string;
  name: string;
  nameEn: string;
  nameRu: string;
  nameKk: string;
  lessons: string;
  currency: string;
  price: string;
  fixedPrices: Record<string, number>;
  salePrice: string;
  salePercent: string;
  saleEndsAt: string;
  expiryDays: string;
  benefits: PricingText[];
  isVisible: boolean;
};


export type EditorLanguage = "en" | "ru" | "kk";
export function editBenefit(rows: PricingText[], index: number, language: EditorLanguage, value: string): PricingText[] {
  return rows.map((row, i) => i !== index ? row : language === "en" ? {...row, default: value, en: value} : {...row, [language]: value});
}
export function moveBenefit(rows: PricingText[], index: number, direction: -1 | 1): PricingText[] {
  const target = index + direction;
  if (target < 0 || target >= rows.length) return rows;
  const next = [...rows]; [next[index], next[target]] = [next[target], next[index]]; return next;
}

/** Sale includes its selected academy date, independent of the admin's timezone. */
export function packSaleEnd(value: string): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  try { return new Date(zonedToInstant(value, "24:00", "Asia/Almaty").getTime() - 1).toISOString(); }
  catch { return undefined; }
}
