"use client";

import { useLocale } from "@/i18n/provider";
import { locales, localeNames, type Locale } from "@/i18n/config";
import { Globe } from "lucide-react";

type LanguageSelectOption<T extends string> = {
  value: T;
  label: string;
};

type LanguageSelectControlProps<T extends string> = {
  value: T;
  onChange: (value: T) => void;
  options: readonly LanguageSelectOption<T>[];
  ariaLabel: string;
  iconOnly?: boolean;
};

export function LanguageSelectControl<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  iconOnly = false,
}: LanguageSelectControlProps<T>) {
  return (
    <div className={iconOnly ? "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-muted focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-purple-600" : "flex items-center gap-1.5"}>
      <Globe aria-hidden="true" className={iconOnly ? "h-5 w-5 text-foreground" : "h-4 w-4 text-muted-foreground"} />
      <select
        value={value}
        onChange={(event) => onChange(event.target.value as T)}
        aria-label={ariaLabel}
        title={ariaLabel}
        className={iconOnly ? "absolute inset-0 h-full w-full cursor-pointer opacity-0" : "h-8 rounded-md border bg-background px-2 text-sm"}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function LanguageSwitcher() {
  const { locale, setLocale } = useLocale();

  return (
    <LanguageSelectControl
      value={locale}
      onChange={(nextLocale) => setLocale(nextLocale as Locale)}
      options={locales.map((locale) => ({ value: locale, label: localeNames[locale] }))}
      ariaLabel="Language"
    />
  );
}
