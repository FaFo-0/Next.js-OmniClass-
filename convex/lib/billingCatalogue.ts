// Pure catalogue presentation and ordering rules shared by Convex read models and UI tests.

export type BillingLocale = "en" | "ru" | "ar" | "kk";
export type BillingLocalizedText = {
  default: string;
  en?: string;
  ru?: string;
  ar?: string;
  kk?: string;
};

export const BILLING_SECTIONS = [
  "family",
  "description",
  "price",
  "lessons",
  "expiry",
  "benefits",
  "badge",
] as const;
export type BillingSection = (typeof BILLING_SECTIONS)[number];
export type BillingCardVariant = "standard" | "compact" | "featured";
export type BillingAccent = "purple" | "gold" | "blue" | "green" | "slate";

export type BillingPresentation = {
  variant: BillingCardVariant;
  accent: BillingAccent;
  featured: boolean;
  badge?: BillingLocalizedText;
  ctaLabel?: BillingLocalizedText;
  sectionOrder: BillingSection[];
  sections: Record<BillingSection, boolean>;
};

export type CatalogueOfferForSort = {
  id: string;
  familySortOrder: number;
  familyId: string;
  planSortOrder: number;
  planId: string;
  versionSortOrder: number;
  version: number;
};

const defaultSections: Record<BillingSection, boolean> = {
  family: true,
  description: true,
  price: true,
  lessons: true,
  expiry: true,
  benefits: true,
  badge: true,
};

export function localizeBillingText(value: BillingLocalizedText, locale: BillingLocale): string {
  const requested = value[locale]?.trim();
  if (requested) return requested;
  const english = value.en?.trim();
  if (english) return english;
  return value.default.trim();
}

export function sortCatalogueOffers<T extends CatalogueOfferForSort>(offers: T[]): T[] {
  return [...offers].sort((a, b) =>
    a.familySortOrder - b.familySortOrder ||
    a.familyId.localeCompare(b.familyId) ||
    a.planSortOrder - b.planSortOrder ||
    a.planId.localeCompare(b.planId) ||
    a.versionSortOrder - b.versionSortOrder ||
    b.version - a.version ||
    a.id.localeCompare(b.id)
  );
}

export function normalizePresentation(input?: Partial<{
  variant: string;
  accent: string;
  featured: boolean;
  badge: BillingLocalizedText;
  ctaLabel: BillingLocalizedText;
  sectionOrder: string[];
  sections: Partial<Record<BillingSection, boolean>>;
}> | null): BillingPresentation {
  const sectionOrder: BillingSection[] = [];
  for (const section of input?.sectionOrder ?? BILLING_SECTIONS) {
    if ((BILLING_SECTIONS as readonly string[]).includes(section) && !sectionOrder.includes(section as BillingSection)) {
      sectionOrder.push(section as BillingSection);
    }
  }
  if (sectionOrder.length === 0) sectionOrder.push(...BILLING_SECTIONS);
  const variant: BillingCardVariant = input?.variant === "compact" || input?.variant === "featured" ? input.variant : "standard";
  const accent: BillingAccent = input?.accent === "gold" || input?.accent === "blue" || input?.accent === "green" || input?.accent === "slate" ? input.accent : "purple";
  return {
    variant,
    accent,
    featured: input?.featured === true,
    badge: input?.badge,
    ctaLabel: input?.ctaLabel,
    sectionOrder,
    sections: { ...defaultSections, ...(input?.sections ?? {}) },
  };
}
