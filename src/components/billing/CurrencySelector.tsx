"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { useLocale } from "@/i18n/provider";
import { api } from "@convex";

export function CurrencySelector({ value, onChange, disabled = false }: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  const { locale } = useLocale();
  const labels = { ar: { currency: "العملة", rates: "أسعار الصرف: ExchangeRate-API" }, ru: { currency: "Валюта", rates: "Курсы: ExchangeRate-API" }, kk: { currency: "Валюта", rates: "Бағамдар: ExchangeRate-API" }, en: { currency: "Currency", rates: "Rates by ExchangeRate-API" } }[locale];
  const settings = useQuery(api.currencies.publicSettings, {});
  const currencies = settings?.enabledCurrencies ?? ["USD", "KZT"];
  return <span className="inline-flex flex-wrap items-center gap-2"><select aria-label={labels.currency} className="input w-auto" dir="ltr" value={value} disabled={disabled || !settings} onChange={event => {
    const code = event.target.value;
    try { localStorage.setItem("omnica-currency", code); } catch { /* Storage can be unavailable in private sessions. */ }
    onChange(code);
  }}>
    {currencies.map(code => <option key={code} value={code}>{code}</option>)}
  </select><a className="text-[10px] text-gray-500" href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">{labels.rates}</a></span>;
}
