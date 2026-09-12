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

export type BillingRolloutMode = "legacy" | "dual_read" | "orders";
export type BillingSurface = {
  source: "versioned" | "legacy_adapter";
  showLegacyHistory: boolean;
  compatibilityLabel?: "legacy" | "dual_read" | "empty_catalogue";
};

export type BillingQueueOrder = {
  orderId: string;
  buyerName: string;
  buyerStudentId: string;
  requestedAt: string;
  status: "pending_verification" | "granted" | "rejected" | "cancelled";
  planSnapshot: { familyLabel: string; planLabel: string; lessonCount: number; expiryDays: number };
  priceSnapshot: { listAmount: number; discountAmount: number; netAmount: number; currency: string; calculatedAt: string };
  discountSnapshot?: { discountId?: string; name: string; kind: "percent" | "fixed"; value: number; amount: number; currency?: string; scope: "all_plans" | "family" | "plan"; eligibility: "everyone" | "new_clients_only" | "allowlist"; priority: number; startsAt?: string; endsAt?: string; maxRedemptions?: number; redemptionCountAtCalculation?: number; validAt: string; calculatedAt?: string } | null;
  rejectionReason?: string | null;
};

export function resolveBillingSurface(input: {
  billingMode: BillingRolloutMode;
  versionedOfferCount: number;
  legacyPackageCount: number;
}): BillingSurface {
  if (input.billingMode === "legacy") {
    return { source: "legacy_adapter", showLegacyHistory: true, compatibilityLabel: "legacy" };
  }
  if (input.versionedOfferCount === 0) {
    return { source: "legacy_adapter", showLegacyHistory: true, compatibilityLabel: "empty_catalogue" };
  }
  if (input.billingMode === "dual_read") {
    return { source: "versioned", showLegacyHistory: input.legacyPackageCount > 0, compatibilityLabel: "dual_read" };
  }
  return { source: "versioned", showLegacyHistory: false };
}

export function billingOrderAdminLink(orderId: string): string {
  return `/admin/billing?tab=commercial&order=${encodeURIComponent(orderId)}`;
}

export function orderQueueDetails(order: BillingQueueOrder) {
  return {
    orderId: order.orderId,
    buyerName: order.buyerName,
    buyerStudentId: order.buyerStudentId,
    requestedAt: order.requestedAt,
    status: order.status,
    familyLabel: order.planSnapshot.familyLabel,
    planLabel: order.planSnapshot.planLabel,
    lessonCount: order.planSnapshot.lessonCount,
    expiryDays: order.planSnapshot.expiryDays,
    listAmount: order.priceSnapshot.listAmount,
    discountAmount: order.priceSnapshot.discountAmount,
    netAmount: order.priceSnapshot.netAmount,
    currency: order.priceSnapshot.currency,
    discount: order.discountSnapshot ? {
      id: order.discountSnapshot.discountId,
      name: order.discountSnapshot.name,
      kind: order.discountSnapshot.kind,
      value: order.discountSnapshot.value,
      amount: order.discountSnapshot.amount,
      currency: order.discountSnapshot.currency,
      scope: order.discountSnapshot.scope,
      eligibility: order.discountSnapshot.eligibility,
      priority: order.discountSnapshot.priority,
      startsAt: order.discountSnapshot.startsAt,
      endsAt: order.discountSnapshot.endsAt,
      maxRedemptions: order.discountSnapshot.maxRedemptions,
      redemptionCountAtCalculation: order.discountSnapshot.redemptionCountAtCalculation,
      validAt: order.discountSnapshot.validAt,
      calculatedAt: order.discountSnapshot.calculatedAt,
    } : null,
    rejectionReason: order.rejectionReason ?? null,
  };
}

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
  const mandatorySections = ["family", "price", "lessons", "expiry", "benefits"] as const;
  const sectionOrder: BillingSection[] = [];
  for (const section of input?.sectionOrder ?? BILLING_SECTIONS) {
    if ((BILLING_SECTIONS as readonly string[]).includes(section) && !sectionOrder.includes(section as BillingSection)) {
      sectionOrder.push(section as BillingSection);
    }
  }
  if (sectionOrder.length === 0) sectionOrder.push(...BILLING_SECTIONS);
  for (const section of mandatorySections) {
    if (!sectionOrder.includes(section)) sectionOrder.push(section);
  }
  const variant: BillingCardVariant = input?.variant === "compact" || input?.variant === "featured" ? input.variant : "standard";
  const accent: BillingAccent = input?.accent === "gold" || input?.accent === "blue" || input?.accent === "green" || input?.accent === "slate" ? input.accent : "purple";
  return {
    variant,
    accent,
    featured: input?.featured === true,
    badge: input?.badge,
    ctaLabel: input?.ctaLabel,
    sectionOrder,
    sections: {
      ...defaultSections,
      ...(input?.sections ?? {}),
      family: true,
      price: true,
      lessons: true,
      expiry: true,
      benefits: true,
    },
  };
}
