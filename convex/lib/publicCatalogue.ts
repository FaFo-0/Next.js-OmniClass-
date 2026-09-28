type Locale = "en" | "ru" | "ar" | "kk";
type LocalizedText = { default: string; en?: string; ru?: string; ar?: string; kk?: string };
type RowId = string | { toString(): string };

type FamilyRow = {
  _id: RowId;
  organizationId: string;
  key: string;
  labels: LocalizedText;
  visibility?: "visible" | "hidden";
  isArchived: boolean;
  sortOrder: number;
};

const PUBLIC_FAMILY_KEY = "basic_tutoring";
const PUBLIC_FAMILY_LABEL = "Standard Tutoring";
const BLOCKED_PUBLIC_BENEFIT = "QA localized";
type PlanRow = {
  _id: RowId;
  organizationId: string;
  familyId: RowId;
  labels: LocalizedText;
  visibility?: "visible" | "hidden";
  isArchived: boolean;
  sortOrder: number;
};
type VersionRow = {
  _id: RowId;
  organizationId: string;
  familyId: RowId;
  planId: RowId;
  version: number;
  status: "draft" | "published" | "superseded" | "archived";
  visibility: "visible" | "hidden";
  currency: string;
  listPrice: number;
  lessonCount: number;
  expiryDays: number;
  sortOrder?: number;
};
type BenefitRow = {
  _id: RowId;
  organizationId: string;
  planVersionId: RowId;
  sortOrder: number;
  labels: LocalizedText;
};

export type PublicCatalogueOffer = {
  family: string;
  packName: string;
  priceKzt: number;
  lessonCount: number;
  expiryDays: number;
  benefits: string[];
};

function id(value: RowId): string {
  return String(value);
}

function localize(value: LocalizedText, locale: Locale): string {
  return value[locale]?.trim() || value.en?.trim() || value.default.trim();
}

export function buildPublicCatalogue({
  organizationId,
  locale,
  families,
  plans,
  versions,
  benefits,
}: {
  organizationId: string;
  locale: Locale;
  families: FamilyRow[];
  plans: PlanRow[];
  versions: VersionRow[];
  benefits: BenefitRow[];
}): PublicCatalogueOffer[] {
  const familyMap = new Map(
    families
      .filter((row) =>
        row.organizationId === organizationId &&
        row.key === PUBLIC_FAMILY_KEY &&
        !row.isArchived &&
        row.visibility !== "hidden"
      )
      .map((row) => [id(row._id), row]),
  );
  const planMap = new Map(
    plans
      .filter((row) => row.organizationId === organizationId && !row.isArchived && row.visibility !== "hidden" && familyMap.has(id(row.familyId)))
      .map((row) => [id(row._id), row]),
  );

  const latestByPlan = new Map<string, VersionRow>();
  for (const version of versions) {
    const plan = planMap.get(id(version.planId));
    if (
      version.organizationId !== organizationId ||
      version.status !== "published" ||
      version.visibility !== "visible" ||
      version.currency !== "KZT" ||
      !Number.isFinite(version.listPrice) ||
      version.listPrice < 0 ||
      !Number.isInteger(version.lessonCount) ||
      version.lessonCount <= 0 ||
      !Number.isInteger(version.expiryDays) ||
      version.expiryDays <= 0 ||
      !familyMap.has(id(version.familyId)) ||
      !plan ||
      id(plan.familyId) !== id(version.familyId)
    ) continue;
    const current = latestByPlan.get(id(version.planId));
    if (!current || version.version > current.version) latestByPlan.set(id(version.planId), version);
  }

  return [...latestByPlan.values()]
    .sort((a, b) => {
      const familyA = familyMap.get(id(a.familyId))!;
      const familyB = familyMap.get(id(b.familyId))!;
      const planA = planMap.get(id(a.planId))!;
      const planB = planMap.get(id(b.planId))!;
      return familyA.sortOrder - familyB.sortOrder || planA.sortOrder - planB.sortOrder || (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || id(a._id).localeCompare(id(b._id));
    })
    .map((version) => {
      const plan = planMap.get(id(version.planId))!;
      return {
        family: PUBLIC_FAMILY_LABEL,
        packName: localize(plan.labels, locale),
        priceKzt: version.listPrice,
        lessonCount: version.lessonCount,
        expiryDays: version.expiryDays,
        benefits: benefits
          .filter((benefit) => benefit.organizationId === organizationId && id(benefit.planVersionId) === id(version._id))
          .sort((a, b) => a.sortOrder - b.sortOrder || id(a._id).localeCompare(id(b._id)))
          .filter((benefit) => !Object.values(benefit.labels).some((label) => label?.trim() === BLOCKED_PUBLIC_BENEFIT))
          .map((benefit) => localize(benefit.labels, locale)),
      };
    });
}
