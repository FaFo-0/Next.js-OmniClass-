export type BillingLocale = "en" | "ru" | "ar" | "kk";

export type BillingLocalizedText = {
  default: string;
  en: string;
  ru: string;
  ar: string;
  kk: string;
};

export type CleanBillingPack = {
  key: string;
  labels: BillingLocalizedText;
  lessonCount: number;
  price: number;
  currency: "KZT";
  expiryDays: 60;
  benefits: BillingLocalizedText[];
};

export type CleanBillingFamily = {
  key: string;
  labels: BillingLocalizedText;
  description: BillingLocalizedText;
  packs: CleanBillingPack[];
};

const standardBenefits: BillingLocalizedText[] = [
  { default: "Structured 1-on-1 tutoring", en: "Structured 1-on-1 tutoring", ru: "Структурированные индивидуальные занятия", ar: "دروس فردية منظمة", kk: "Құрылымдалған жеке сабақтар" },
  { default: "Flexible booking", en: "Flexible booking", ru: "Гибкое бронирование", ar: "حجز مرن", kk: "Икемді брондау" },
  { default: "Homework feedback", en: "Homework feedback", ru: "Обратная связь по домашним заданиям", ar: "ملاحظات على الواجبات المنزلية", kk: "Үй тапсырмасы бойынша кері байланыс" },
  { default: "Progress tracking", en: "Progress tracking", ru: "Отслеживание прогресса", ar: "متابعة التقدم", kk: "Прогресті бақылау" },
];

const ieltsBenefits: BillingLocalizedText[] = [
  { default: "Exam-focused curriculum", en: "Exam-focused curriculum", ru: "Программа с фокусом на экзамен", ar: "منهج يركز على الاختبار", kk: "Емтиханға бағытталған оқу бағдарламасы" },
  { default: "Writing and speaking feedback", en: "Writing and speaking feedback", ru: "Обратная связь по письму и говорению", ar: "ملاحظات على الكتابة والمحادثة", kk: "Жазылым мен айтылым бойынша кері байланыс" },
  { default: "Exam strategy", en: "Exam strategy", ru: "Стратегия сдачи экзамена", ar: "استراتيجيات الاختبار", kk: "Емтихан стратегиясы" },
  { default: "Progress tracking", en: "Progress tracking", ru: "Отслеживание прогресса", ar: "متابعة التقدم", kk: "Прогресті бақылау" },
];

function lessonLabels(lessonCount: number): BillingLocalizedText {
  return {
    default: `${lessonCount} lessons`,
    en: `${lessonCount} lessons`,
    ru: `${lessonCount} уроков`,
    ar: `${lessonCount} دروس`,
    kk: `${lessonCount} сабақ`,
  };
}

function packs(familyKey: string, prices: readonly number[], benefits: BillingLocalizedText[]): CleanBillingPack[] {
  return [4, 8, 12].map((lessonCount, index) => ({
    key: `${familyKey}_${lessonCount}`,
    labels: lessonLabels(lessonCount),
    lessonCount,
    price: prices[index]!,
    currency: "KZT",
    expiryDays: 60,
    benefits,
  }));
}

export const CLEAN_BILLING_CATALOGUE: readonly CleanBillingFamily[] = [
  {
    key: "standard_tutoring",
    labels: { default: "Standard Tutoring", en: "Standard Tutoring", ru: "Стандартный английский", ar: "الدروس القياسية", kk: "Стандартты ағылшын тілі" },
    description: { default: "Structured individual tutoring for everyday English progress.", en: "Structured individual tutoring for everyday English progress.", ru: "Структурированные индивидуальные занятия для уверенного прогресса в английском.", ar: "دروس فردية منظمة للتقدم المستمر في اللغة الإنجليزية.", kk: "Ағылшын тіліндегі тұрақты ілгерілеуге арналған құрылымдалған жеке сабақтар." },
    packs: packs("standard_tutoring", [15000, 26000, 36000], standardBenefits),
  },
  {
    key: "ielts",
    labels: { default: "IELTS", en: "IELTS", ru: "IELTS", ar: "IELTS", kk: "IELTS" },
    description: { default: "Focused preparation for IELTS performance.", en: "Focused preparation for IELTS performance.", ru: "Целевая подготовка к IELTS.", ar: "تحضير مركز لاختبار IELTS.", kk: "IELTS-ке бағытталған дайындық." },
    packs: packs("ielts", [20000, 35000, 48000], ieltsBenefits),
  },
] as const;

/**
 * The permanent reset is deliberately limited to the canonical billing model.
 * Provenance rows are selected by billingOrderId or the billing-order source-key;
 * it never treats a whole shared ledger or notification table as disposable.
 */
export const BILLING_RESET_TABLES = [
  "billingDiscountRedemptions",
  "billingDiscountEligibleStudents",
  "billingDiscounts",
  "billingPlanBenefits",
  "billingPlanVersions",
  "billingPlans",
  "billingFamilies",
  "billingOrders",
  "pointGrants",
  "pointTransactions",
  "financeEntries",
  "notifications",
] as const;

/** Tables shared with non-billing product history. Rows in these tables must
 * be selected by billing provenance; the reset must never delete the table. */
export const BILLING_RESET_SCOPED_TABLES = [
  "pointGrants",
  "pointTransactions",
  "financeEntries",
  "notifications",
] as const;

export type BillingResetCounts = Record<string, number>;

export function buildBillingResetPlan(organizationId: string, counts: BillingResetCounts) {
  if (!organizationId.trim()) throw new Error("Billing reset requires an organization id");
  const rows = Object.fromEntries(BILLING_RESET_TABLES.map((table) => [table, counts[table] ?? 0]));
  const deleteCount = Object.values(rows).reduce((sum, count) => sum + count, 0);
  return {
    organizationId,
    rows,
    deleteCount,
    scopedTables: [...BILLING_RESET_SCOPED_TABLES],
    preservedTables: Object.keys(counts).filter((table) => !BILLING_RESET_TABLES.includes(table as typeof BILLING_RESET_TABLES[number])),
  };
}
