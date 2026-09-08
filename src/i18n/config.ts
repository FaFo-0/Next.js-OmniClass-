// Locales the app offers. Arabic ships RTL; English, Russian and Kazakh are LTR.
export const locales = ["en", "ru", "ar", "kk"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export const localeNames: Record<Locale, string> = {
  en: "English",
  ru: "Русский",
  ar: "العربية",
  kk: "Қазақша",
};

export const localeDirection: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  ru: "ltr",
  ar: "rtl",
  kk: "ltr",
};
