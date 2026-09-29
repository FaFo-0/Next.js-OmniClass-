// Canonical launch pricing catalogue.
//
// This is the same offer the academy announced in POLICY §1: Standard Tutoring
// then IELTS, 4 / 8 / 12 lessons, 60 days from first use. It seeds the pricing
// tables and is the reviewed source for the one-time migration off the retired
// versioned catalogue.

export type SeedPricingText = {
  default: string;
  en?: string;
  ru?: string;
};

export type SeedPack = {
  name: string;
  nameEn: string;
  nameRu: string;
  lessons: number;
  price: number;
  currency: string;
  expiryDays: number;
  benefits: SeedPricingText[];
};

export type SeedFamily = {
  label: string;
  labelEn: string;
  labelRu: string;
  description: string;
  descriptionEn: string;
  descriptionRu: string;
  /** Shown on the public website. IELTS is sold inside the portal only. */
  showOnWebsite: boolean;
  packs: SeedPack[];
};

export const PRICING_SEED_CONFIRMATION = "SEED_PRICING_CATALOGUE" as const;

const standardBenefits: SeedPricingText[] = [
  { default: "Structured 1-on-1 tutoring", en: "Structured 1-on-1 tutoring", ru: "Структурированные индивидуальные занятия" },
  { default: "Flexible booking", en: "Flexible booking", ru: "Гибкое бронирование" },
  { default: "Homework feedback", en: "Homework feedback", ru: "Обратная связь по домашним заданиям" },
  { default: "Progress tracking", en: "Progress tracking", ru: "Отслеживание прогресса" },
];

const ieltsBenefits: SeedPricingText[] = [
  { default: "Exam-focused curriculum", en: "Exam-focused curriculum", ru: "Программа с фокусом на экзамен" },
  { default: "Writing and speaking feedback", en: "Writing and speaking feedback", ru: "Обратная связь по письму и говорению" },
  { default: "Exam strategy", en: "Exam strategy", ru: "Стратегия сдачи экзамена" },
  { default: "Progress tracking", en: "Progress tracking", ru: "Отслеживание прогресса" },
];

/** Correct Russian lesson forms: 1 урок, 2-4 урока, 5+ уроков. */
function russianLessons(count: number): string {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} уроков`;
  if (last === 1) return `${count} урок`;
  if (last >= 2 && last <= 4) return `${count} урока`;
  return `${count} уроков`;
}

function englishLessons(count: number): string {
  return `${count} ${count === 1 ? "lesson" : "lessons"}`;
}

function packs(prices: readonly number[], benefits: SeedPricingText[]): SeedPack[] {
  const [four, eight, twelve] = prices as [number, number, number];
  return [
    { lessons: 4, price: four },
    { lessons: 8, price: eight },
    { lessons: 12, price: twelve },
  ].map(({ lessons, price }) => ({
    name: englishLessons(lessons),
    nameEn: englishLessons(lessons),
    nameRu: russianLessons(lessons),
    lessons,
    price,
    currency: "KZT",
    expiryDays: 60,
    benefits,
  }));
}

export const LAUNCH_PRICING_CATALOGUE: readonly SeedFamily[] = [
  {
    label: "Standard Tutoring",
    labelEn: "Standard Tutoring",
    labelRu: "Стандартный английский",
    description: "Structured individual tutoring for everyday English progress.",
    descriptionEn: "Structured individual tutoring for everyday English progress.",
    descriptionRu: "Структурированные индивидуальные занятия для уверенного прогресса в английском.",
    showOnWebsite: true,
    packs: packs([15_000, 26_000, 36_000], standardBenefits),
  },
  {
    label: "IELTS",
    labelEn: "IELTS",
    labelRu: "IELTS",
    description: "Focused preparation for IELTS performance.",
    descriptionEn: "Focused preparation for IELTS performance.",
    descriptionRu: "Целевая подготовка к IELTS.",
    showOnWebsite: false,
    packs: packs([20_000, 35_000, 48_000], ieltsBenefits),
  },
] as const;

export type SeedPlan = {
  families: Array<{ label: string; packs: number }>;
  familyCount: number;
  packCount: number;
};

export function buildSeedPlan(): SeedPlan {
  return {
    families: LAUNCH_PRICING_CATALOGUE.map((family) => ({ label: family.label, packs: family.packs.length })),
    familyCount: LAUNCH_PRICING_CATALOGUE.length,
    packCount: LAUNCH_PRICING_CATALOGUE.reduce((total, family) => total + family.packs.length, 0),
  };
}
