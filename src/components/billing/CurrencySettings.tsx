"use client";
import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@convex";
import { toast } from "sonner";
import { convertMoney } from "../../../convex/lib/money";

export function CurrencySettings() {
  const settings = useQuery(api.currencies.settings, {});
  const save = useMutation(api.currencies.update);
  const configure = useMutation(api.currencies.configure);
  const saveHistorical = useMutation(api.currencies.recordHistoricalRate);
  const [historical, setHistorical] = useState({ date: "", currency: "KZT", usdPerUnit: "", source: "" });
  const [selection, setSelection] = useState<string[] | null>(null);
  const [rateInput, setRateInput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("100");
  const [from, setFrom] = useState("USD");
  const [to, setTo] = useState("KZT");
  if (!settings) return null;
  const selected = selection ?? settings.enabledCurrencies;
  const rate = rateInput ?? String(settings.rates.USD ?? "");
  let converted = "—";
  try {
    if (amount.trim()) converted = new Intl.NumberFormat("en", { style: "currency", currency: to }).format(convertMoney(Number(amount), from, to, settings.rates));
  } catch { /* A missing rate must never masquerade as a valid conversion. */ }
  async function submit(action: () => Promise<unknown>) {
    setBusy(true);
    try { await action(); toast.success("Currency settings saved"); }
    catch (error) { toast.error((error as Error).message); }
    finally { setBusy(false); }
  }
  return <details className="card" style={{ padding: 16, marginBottom: 16 }}>
    <summary style={{ cursor: "pointer", fontWeight: 600 }}>Currencies · USD accounting</summary>
    <p className="body-sm mt-3">Daily reference rates convert new entries. Recorded transactions retain their original amounts and rates.</p>
    <p className="body-sm mt-2">Rate source: {settings.source}{settings.rateUpdatedAt ? ` · ${new Date(settings.rateUpdatedAt).toLocaleString()}` : " · not updated"}</p>
    <a className="body-sm link" href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates by Exchange Rate API</a>
    <fieldset className="mt-4" disabled={busy}>
      <legend className="body-sm font-semibold">Currencies customers can choose</legend>
      <div className="mt-2 flex max-h-48 flex-wrap gap-3 overflow-y-auto">
        {settings.availableCurrencies.map(code => <label key={code} className="body-sm flex items-center gap-1"><input type="checkbox" checked={selected.includes(code)} disabled={code === "USD"} onChange={event => setSelection(event.target.checked ? [...selected, code] : selected.filter(item => item !== code))} />{code}</label>)}
      </div>
      <button type="button" className="btn btn-tenant mt-3" onClick={() => submit(() => configure({ enabledCurrencies: selected }))}>Save enabled currencies</button>
    </fieldset>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="body-sm">Manual override: KZT for 1 USD<input className="input" type="number" min="0.000001" step="any" value={rate} onChange={event => setRateInput(event.target.value)} /></label>
      <button type="button" className="btn" disabled={busy || !Number.isFinite(Number(rate)) || Number(rate) <= 0} onClick={() => submit(() => save({ baseCurrency: "USD", usdToKzt: Number(rate) }))}>Save reference rate</button>
    </div>
    <p className="body-sm mt-2">The next daily update replaces this reference rate. Existing records stay fixed.</p>
    <fieldset className="mt-4" disabled={busy}>
      <legend className="body-sm font-semibold">Historical rate for a backdated entry</legend>
      <p className="body-sm mt-2">Enter the documented rate for the transaction date. For a date without rates, enter KZT first. This does not change today’s rates or recorded transactions.</p>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="body-sm">Date<input className="input" type="date" value={historical.date} onChange={event => setHistorical({ ...historical, date: event.target.value })} /></label>
        <label className="body-sm">Currency<input className="input" maxLength={3} value={historical.currency} onChange={event => setHistorical({ ...historical, currency: event.target.value.toUpperCase() })} /></label>
        <label className="body-sm">USD per 1 unit<input className="input" type="number" min="0" step="any" value={historical.usdPerUnit} onChange={event => setHistorical({ ...historical, usdPerUnit: event.target.value })} /></label>
        <label className="body-sm">Rate source<input className="input" maxLength={300} value={historical.source} onChange={event => setHistorical({ ...historical, source: event.target.value })} /></label>
        <button type="button" className="btn" disabled={!historical.date || !historical.source.trim() || !Number.isFinite(Number(historical.usdPerUnit)) || Number(historical.usdPerUnit) <= 0} onClick={() => submit(() => saveHistorical({ ...historical, usdPerUnit: Number(historical.usdPerUnit) }))}>Save historical rate</button>
      </div>
    </fieldset>
    <fieldset className="mt-4">
      <legend className="body-sm font-semibold">Quick converter</legend>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input className="input" aria-label="Amount to convert" type="number" step="any" value={amount} onChange={event => setAmount(event.target.value)} />
        <select className="input" aria-label="Convert from" value={from} onChange={event => setFrom(event.target.value)}>{settings.availableCurrencies.map(code => <option key={code}>{code}</option>)}</select>
        <span>→</span>
        <select className="input" aria-label="Convert to" value={to} onChange={event => setTo(event.target.value)}>{settings.availableCurrencies.map(code => <option key={code}>{code}</option>)}</select>
        <output className="font-semibold" aria-live="polite">{converted}</output>
      </div>
    </fieldset>
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <a className="link" href="/prices" target="_blank" rel="noreferrer">Open public prices</a>
      <button type="button" className="btn" onClick={async () => { try { await navigator.clipboard.writeText(`${window.location.origin}/prices`); toast.success("Prices link copied"); } catch { toast.error("Could not copy link"); } }}>Copy prices link</button>
    </div>
  </details>;
}
