"use client";
import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useMutation } from "convex/react";
import { api } from "@convex";
import { toast } from "sonner";

export function CurrencySettings() {
  const settings = useQuery(api.currencies.settings, {});
  const save = useMutation(api.currencies.update);
  const [draft, setDraft] = useState<{ base: "KZT" | "USD"; rate: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const preview = useQuery(api.finance.monthSummary, settings && draft && draft.base !== settings.baseCurrency ? { reportingCurrency: draft.base } : "skip");
  if (!settings) return null;
  const base = draft?.base ?? (settings.baseCurrency === "USD" ? "USD" : "KZT");
  const rate = draft?.rate ?? String(settings.rates.USD ?? "");
  return <details className="card" style={{ padding: 16, marginBottom: 16 }}>
    <summary style={{ cursor: "pointer", fontWeight: 600 }}>Currency settings · {settings.baseCurrency} · 1 USD = {settings.rates.USD ?? "—"} KZT</summary>
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "end", marginTop: 14 }}>
      <label className="body-sm">Platform base currency<select className="input" aria-label="Platform base currency" value={base} onChange={e => setDraft({ base: e.target.value as "KZT" | "USD", rate })}><option>KZT</option><option>USD</option></select></label>
      <label className="body-sm">KZT for 1 USD<input className="input" aria-label="KZT for 1 USD" type="number" min="0.01" step="0.01" value={rate} onChange={e => setDraft({ base, rate: e.target.value })} /></label>
      <button className="btn btn-tenant" disabled={busy || (base !== settings.baseCurrency && !preview) || !Number.isFinite(Number(rate)) || Number(rate) <= 0} onClick={async () => {
        if (base !== settings.baseCurrency && !confirm(`Change the platform base to ${base}? Historical transactions keep their recorded exchange rates. Pack prices and teacher currency agreements stay intact.`)) return;
        setBusy(true);
        try { await save({ baseCurrency: base, usdToKzt: Number(rate) }); setDraft(null); toast.success("Currency settings saved"); }
        catch (error) { toast.error((error as Error).message); }
        finally { setBusy(false); }
      }}>{busy ? "Saving…" : "Save currencies"}</button>
    </div>
    {preview && <p className="body-sm" style={{ marginTop: 10 }}>This month in {preview.currency}: income {preview.income.toLocaleString()} · costs {preview.costs.toLocaleString()} · net {preview.net.toLocaleString()}</p>}
    <p className="body-sm" style={{ marginTop: 10 }}>Changing the rate affects new records and dollar equivalents. Recorded transactions keep their original rate. Switching the base uses each transaction’s recorded rate for historical reports.</p>
    <p className="body-sm" style={{ marginTop: 4 }}>Rate source: {settings.source}{settings.rateUpdatedAt ? ` · ${settings.rateUpdatedAt.slice(0, 10)}` : ""}</p>
  </details>;
}
