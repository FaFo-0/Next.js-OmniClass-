// Locales the app actually offers. Arabic ships with RTL; Russian's
// catalogue exists (messages/ru.json) but the UI hasn't been checked in it
// yet, so it stays out of the switcher rather than half-translating the app.
export const locales = ["en", "ar"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export const localeNames: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
};

export const localeDirection: Record<Locale, "ltr" | "rtl"> = {
  en: "ltr",
  ar: "rtl",
};
