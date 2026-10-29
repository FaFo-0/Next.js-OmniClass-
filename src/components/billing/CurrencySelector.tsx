"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";

export function CurrencySelector({ value, onChange, disabled = false }: {
  value: string;
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  const settings = useQuery(api.currencies.publicSettings, {});
  const currencies = settings?.enabledCurrencies ?? ["USD", "KZT"];
  return <span className="inline-flex flex-wrap items-center gap-2"><select aria-label="Currency" className="input w-auto" dir="ltr" value={value} disabled={disabled || !settings} onChange={event => {
    const code = event.target.value;
    try { localStorage.setItem("omnica-currency", code); } catch { /* Storage can be unavailable in private sessions. */ }
    onChange(code);
  }}>
    {currencies.map(code => <option key={code} value={code}>{code}</option>)}
  </select><a className="body-sm muted" href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates by ExchangeRate-API</a></span>;
}
