"use client";

import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@convex";
import { toast } from "sonner";

const names = new Intl.DisplayNames(["en"], { type: "currency" });
function currencyName(code: string) {
  try { return names.of(code) ?? code; }
  catch { return code; }
}

export function CurrencySettings() {
  const settings = useQuery(api.currencies.settings, {});
  const configure = useMutation(api.currencies.configure);
  const [selection, setSelection] = useState<string[] | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  if (!settings) return null;
  const selected = selection ?? settings.enabledCurrencies;
  const filter = search.trim().toLowerCase();
  const available = settings.availableCurrencies.filter(code => !selected.includes(code) && `${code} ${currencyName(code)}`.toLowerCase().includes(filter));
  const changed = selected.length !== settings.enabledCurrencies.length || selected.some(code => !settings.enabledCurrencies.includes(code));

  async function save() {
    setBusy(true);
    try {
      await configure({ enabledCurrencies: selected });
      setSelection(null);
      toast.success("Currencies saved");
    } catch (error) { toast.error((error as Error).message); }
    finally { setBusy(false); }
  }

  return <section className="card" style={{ padding: 24, marginBottom: 20 }} aria-labelledby="currencies-heading">
    <h2 id="currencies-heading" className="h3" style={{ marginBottom: 4 }}>Currencies</h2>
    <p className="body-sm" style={{ marginBottom: 16 }}>Choose the currencies available for prices and payments.</p>
    <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
      {selected.map(code => <li key={code} className="flex items-center justify-between gap-3 border-b py-2">
        <span className="body-sm"><strong>{code}</strong><span className="ms-2">{currencyName(code)}</span></span>
        {code === "USD" ? <span className="body-sm muted">Base</span> : <button type="button" className="btn btn-ghost btn-sm" disabled={busy} aria-label={`Remove ${code}`} onClick={() => setSelection(selected.filter(item => item !== code))}>Remove</button>}
      </li>)}
    </ul>
    <fieldset disabled={busy} className="mt-4">
      <legend className="body-sm font-semibold">Add currency</legend>
      <div className="mt-2 flex flex-wrap gap-2">
        <input className="input min-w-0 flex-1 basis-40" aria-label="Search currencies" placeholder="Search by name or code" value={search} onChange={event => setSearch(event.target.value)} />
        <select className="input min-w-0 flex-1 basis-48" aria-label="Add currency" value="" onChange={event => { if (event.target.value) { setSelection([...selected, event.target.value]); setSearch(""); } }}>
          <option value="">{available.length ? "Select currency…" : "No matching currencies"}</option>
          {available.map(code => <option key={code} value={code}>{code} · {currencyName(code)}</option>)}
        </select>
      </div>
    </fieldset>
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="body-sm muted" style={{ fontSize: 11 }}>{settings.source}{settings.rateUpdatedAt ? ` · ${new Date(settings.rateUpdatedAt).toLocaleDateString()}` : ""} · <a className="link" href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates by Exchange Rate API</a></p>
      <button type="button" className="btn btn-tenant" disabled={busy || !changed} onClick={() => void save()}>{busy ? "Saving…" : "Save currencies"}</button>
    </div>
  </section>;
}
