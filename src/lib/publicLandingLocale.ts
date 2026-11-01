import { currencyDigits } from "../../convex/lib/money";
export type PublicLandingLocale = "ru" | "kk" | "en" | "ar";

type SearchParamsLike = Pick<URLSearchParams, "get" | "toString">;
type LandingUnit = "lesson" | "day";

export function resolveLandingLocale(searchParams: SearchParamsLike): PublicLandingLocale {
  const requested = searchParams.get("lang");
  return requested === "ar" || requested === "kk" || requested === "en" ? requested : "ru";
}

export function buildPublicHref(path: string, locale: PublicLandingLocale, searchParams: SearchParamsLike): string {
  const next = new URLSearchParams(searchParams.toString());
  next.set("lang", locale);
  return `${path}?${next.toString()}`;
}

export function buildLandingLanguageHref(locale: PublicLandingLocale, searchParams: SearchParamsLike): string {
  return buildPublicHref("/", locale, searchParams);
}

export function formatLandingPrice(value: number, currency: string, locale: PublicLandingLocale): string {
  return new Intl.NumberFormat({ ru: "ru-KZ", kk: "kk-KZ", en: "en-KZ", ar: "ar-SA" }[locale], {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "KZT" || currency === "SAR" ? 0 : currencyDigits(currency),
  }).format(value);
}

function russianPlural(value: number, forms: readonly [string, string, string]): string {
  const absolute = Math.abs(value);
  const lastTwo = absolute % 100;
  const last = absolute % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return forms[2];
  if (last === 1) return forms[0];
  if (last >= 2 && last <= 4) return forms[1];
  return forms[2];
}

export function landingUnit(value: number, unit: LandingUnit, locale: PublicLandingLocale): string {
  if (locale === "en") {
    const singular = unit === "lesson" ? "lesson" : "day";
    return value === 1 ? singular : `${singular}s`;
  }
  if (locale === "ar") return unit === "lesson" ? (value >= 3 && value <= 10 ? "دروس" : "درسًا") : (value >= 3 && value <= 10 ? "أيام" : "يومًا");
  if (locale === "kk") return unit === "lesson" ? "сабақ" : "күн";
  return unit === "lesson"
    ? russianPlural(value, ["урок", "урока", "уроков"])
    : russianPlural(value, ["день", "дня", "дней"]);
}

export function formatLandingLessonCount(value: number, locale: PublicLandingLocale): string {
  return `${value} ${landingUnit(value, "lesson", locale)}`;
}

export function landingTrialHeading(value: number, locale: PublicLandingLocale): string {
  if (locale === "ar") return value === 1 ? "ابدأ بدرس تجريبي" : `ابدأ بدروس تجريبية: ${value}`;
  if (locale === "en") return value === 1 ? "Start with a trial lesson" : `Start with ${value} trial lessons`;
  if (locale === "kk") return value === 1 ? "Сынақ сабағынан бастаңыз" : `${value} сынақ сабағынан бастаңыз`;
  return value === 1 ? "Начните с пробного урока" : `Начните с ${value} пробных уроков`;
}

export function landingPackDetails(lessons: number, days: number, locale: PublicLandingLocale): string {
  if (locale === "ar") return `${formatLandingLessonCount(lessons, locale)} · الصلاحية ${days} يومًا من أول استخدام`;
  if (locale === "en") return `${lessons} ${landingUnit(lessons, "lesson", locale)} · valid for ${days} ${landingUnit(days, "day", locale)} from first use`;
  if (locale === "kk") return `${lessons} ${landingUnit(lessons, "lesson", locale)} · алғашқы пайдаланудан бастап ${days} ${landingUnit(days, "day", locale)} жарамды`;
  return `${lessons} ${landingUnit(lessons, "lesson", locale)} · срок ${days} ${landingUnit(days, "day", locale)} с первого использования`;
}
