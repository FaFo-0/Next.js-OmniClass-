export type PublicLandingLocale = "ru" | "en";

type SearchParamsLike = Pick<URLSearchParams, "get" | "toString">;
type LandingUnit = "lesson" | "day";

export function resolveLandingLocale(searchParams: SearchParamsLike): PublicLandingLocale {
  return searchParams.get("lang") === "en" ? "en" : "ru";
}

export function buildLandingLanguageHref(
  locale: PublicLandingLocale,
  searchParams: SearchParamsLike,
): string {
  const next = new URLSearchParams(searchParams.toString());
  next.set("lang", locale);
  return `/?${next.toString()}`;
}

export function formatLandingKzt(value: number, locale: PublicLandingLocale): string {
  return new Intl.NumberFormat(locale === "ru" ? "ru-KZ" : "en-KZ", {
    style: "currency",
    currency: "KZT",
    maximumFractionDigits: 0,
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

export function landingUnit(
  value: number,
  unit: LandingUnit,
  locale: PublicLandingLocale,
): string {
  if (locale === "en") {
    const singular = unit === "lesson" ? "lesson" : "day";
    return value === 1 ? singular : `${singular}s`;
  }
  return unit === "lesson"
    ? russianPlural(value, ["урок", "урока", "уроков"])
    : russianPlural(value, ["день", "дня", "дней"]);
}

export function formatLandingLessonCount(
  value: number,
  locale: PublicLandingLocale,
): string {
  return `${value} ${landingUnit(value, "lesson", locale)}`;
}

export function landingTrialHeading(value: number, locale: PublicLandingLocale): string {
  if (locale === "en") {
    return value === 1 ? "Start with a trial lesson" : `Start with ${value} trial lessons`;
  }
  if (value === 1) return "Начните с пробного урока";
  return `Начните с ${value} пробных уроков`;
}
