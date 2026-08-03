// Locales the app offers. Arabic ships RTL; English and Russian are LTR.
// A locale only belongs here once the student portal is fully translated in
// it — a half-translated UI is worse than an English one.
export const locales = ["en", "ru", "ar"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export const localeNames: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
  ar: "العربية",
};

export const localeDirection: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  ru: "ltr",
  ar: "rtl",
};
