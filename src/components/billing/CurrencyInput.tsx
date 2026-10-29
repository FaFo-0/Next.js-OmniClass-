"use client";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
const names = new Intl.DisplayNames(["en"], { type: "currency" });
/** Money-entry currency: account configuration, without changing customer preferences. */
export function CurrencyInput({ value, onChange, label = "Currency", disabled = false }: {value:string;onChange:(value:string)=>void;label?:string;disabled?:boolean}) {
 const settings = useQuery(api.currencies.publicSettings, {});
 const enabled = settings?.enabledCurrencies ?? ["USD","KZT"];
 const codes = value && !enabled.includes(value) ? [value,...enabled] : enabled;
 return <select className="input" aria-label={label} value={value} disabled={disabled || !settings} onChange={event=>onChange(event.target.value)}>{codes.map(code=><option key={code} value={code}>{code} · {names.of(code) ?? code}{enabled.includes(code) ? "" : " (existing)"}</option>)}</select>;
}
