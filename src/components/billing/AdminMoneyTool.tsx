"use client";
import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { convertMoney } from "../../../convex/lib/money";
export function AdminMoneyTool() {
 const fx = useQuery(api.currencies.publicSettings, {});
 const [amount,setAmount] = useState("100"), [from,setFrom] = useState("USD"), [to,setTo] = useState("KZT");
 const currencies = fx?.enabledCurrencies ?? ["USD","KZT"];
 const source = currencies.includes(from) ? from : "USD";
 const target = currencies.includes(to) ? to : (currencies.find(code=>code!==source) ?? source);
 let result = "—";
 try { if (fx && amount !== "") result = new Intl.NumberFormat("en",{style:"currency",currency:target}).format(convertMoney(Number(amount),source,target,fx.rates)); } catch { /* Pending feed. */ }
 return <details className="rounded-xl border border-purple-100 bg-white/70 p-3 mt-3"><summary className="cursor-pointer text-sm font-semibold text-purple-900">Currency converter</summary><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[minmax(5rem,9rem)_minmax(5rem,8rem)_minmax(5rem,8rem)_1fr] sm:items-center"><input className="input" aria-label="Amount to convert" type="number" step="any" value={amount} onChange={e=>setAmount(e.target.value)} />{([[source,setFrom,"From"],[target,setTo,"To"]] as const).map(([value,set,label])=><select className="input" key={label} aria-label={label} value={value} onChange={e=>set(e.target.value)}>{currencies.map(code=><option key={code}>{code}</option>)}</select>)}<output className="font-semibold" aria-live="polite">{result}</output></div><p className="mt-2 text-[11px] text-gray-500">{fx?.rateUpdatedAt?.slice(0,10) ?? "No rate"} · <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates by ExchangeRate-API</a></p></details>;
}
