"use client";
import { useState } from "react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { convertMoney } from "../../../convex/lib/money";
export function AdminMoneyTool() {
 const fx = useQuery(api.currencies.publicSettings, {});
 const [amount,setAmount] = useState("1"), [from,setFrom] = useState("USD"), [to,setTo] = useState("KZT");
 let result = "—";
 try { if (fx && amount !== "") result = new Intl.NumberFormat("en",{style:"currency",currency:to}).format(convertMoney(Number(amount),from,to,fx.rates)); } catch { /* Missing rates never become a fake equivalent. */ }
 return <details className="card mx-4 my-2 p-3"><summary className="cursor-pointer text-sm">Currency converter · {result}</summary><div className="flex flex-wrap gap-2 mt-2"><input className="input w-28" aria-label="Amount to convert" type="number" step="any" value={amount} onChange={e=>setAmount(e.target.value)} />{([[from,setFrom,"From"],[to,setTo,"To"]] as const).map(([value,set,label])=><select className="input w-auto" key={label} aria-label={label} value={value} onChange={e=>set(e.target.value)}>{(fx?.enabledCurrencies ?? ["USD","KZT"]).map(code=><option key={code}>{code}</option>)}</select>)}<strong>{result}</strong></div><p className="body-sm mt-2">Current estimate · {fx?.rateUpdatedAt?.slice(0,10) ?? "No rate"} · <a href="https://www.exchangerate-api.com" target="_blank" rel="noreferrer">Rates by ExchangeRate-API</a>. Recorded transactions retain their booking rates.</p></details>;
}
