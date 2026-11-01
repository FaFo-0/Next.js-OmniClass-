/** Count-only pack titles share one formatter across catalogue fallbacks and cards. */
export function formatLessonCount(count: number, locale: "en" | "ru" | "kk" | "ar"): string {
  const number = new Intl.NumberFormat(locale).format(count);
  const plural = new Intl.PluralRules(locale).select(count);
  if (locale === "ru") return `${number} ${plural === "one" ? "урок" : plural === "few" ? "урока" : "уроков"}`;
  if (locale === "ar") {
    if (plural === "one") return "درس واحد";
    if (plural === "two") return "درسان";
    return `${number} ${plural === "few" || plural === "zero" ? "دروس" : plural === "many" ? "درسًا" : "درس"}`;
  }
  return `${number} ${locale === "kk" ? "сабақ" : count === 1 ? "lesson" : "lessons"}`;
}

function normalizeTitle(text: string): string {
  return text.normalize("NFKC").toLowerCase()
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x6f0))
    .normalize("NFD").replace(/[\p{M}\p{Cf}\p{P}\s]/gu, "");
}

/** Recognize bare counts even when legacy/authored copy uses the wrong plural. */
export function isLessonCountTitle(title: string, count: number): boolean {
  const normalized = normalizeTitle(title);
  if ((["en", "ru", "kk", "ar"] as const).some(locale => normalized === normalizeTitle(formatLessonCount(count, locale)))) return true;
  const units = "lessons?|урок|урока|уроки|уроков|сабақ|сабақтар|دروس|درس|درسا|درسان|درسين";
  const numberFirst = normalized.match(new RegExp(`^(\\d+)(${units})$`, "u"));
  const numberLast = normalized.match(new RegExp(`^(${units})(\\d+)$`, "u"));
  const digits = numberFirst?.[1] ?? numberLast?.[2];
  return digits !== undefined && Number(digits) === count;
}
