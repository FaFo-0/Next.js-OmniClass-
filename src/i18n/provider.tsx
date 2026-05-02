"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { type Locale, defaultLocale, localeDirection } from "./config";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  dir: "ltr" | "rtl";
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: defaultLocale,
  setLocale: () => {},
  dir: "ltr",
});

export function useLocale() {
  return useContext(LocaleContext);
}

// Cache loaded messages
const messageCache: Partial<Record<Locale, Record<string, unknown>>> = {};

async function loadMessages(locale: Locale) {
  if (messageCache[locale]) return messageCache[locale]!;
  const messages = (await import(`../../messages/${locale}.json`)).default;
  messageCache[locale] = messages;
  return messages;
}

// Pre-load default messages synchronously to avoid null flash
import defaultMessages from "../../messages/en.json";
messageCache.en = defaultMessages as Record<string, unknown>;

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);
  const [messages, setMessages] = useState<Record<string, unknown>>(
    defaultMessages as Record<string, unknown>
  );
  const [mounted, setMounted] = useState(false);

  // Load saved locale from localStorage
  useEffect(() => {
    const saved = localStorage.getItem("lingulab-locale") as Locale | null;
    if (saved && ["en", "ru"].includes(saved)) {
      setLocaleState(saved);
    }
    setMounted(true);
  }, []);

  // Load messages when locale changes
  useEffect(() => {
    loadMessages(locale).then(setMessages);
  }, [locale]);

  // Update document attributes when locale changes
  useEffect(() => {
    if (!mounted) return;
    const dir = localeDirection[locale];
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
  }, [locale, mounted]);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem("lingulab-locale", newLocale);
  }, []);

  const dir = localeDirection[locale];

  return (
    <LocaleContext.Provider value={{ locale, setLocale, dir }}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
