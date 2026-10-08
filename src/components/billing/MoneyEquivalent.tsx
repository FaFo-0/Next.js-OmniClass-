"use client";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { useLocale } from "next-intl";
import { api } from "@convex";
import { convertMoney } from "../../../convex/lib/money";
import { formatBillingAmount } from "./billingView";

/** Display only: the agreed original price never changes with the exchange rate. */
export function MoneyEquivalent({ amount, currency }: { amount: number; currency: string }) {
  const tenant = useQuery(api.tenantSettings.getActive, {});
  const locale = useLocale();
  if (!tenant || !Number.isFinite(amount)) return null;
  const target = currency === tenant.baseCurrency ? (currency === "USD" ? "KZT" : "USD") : tenant.baseCurrency;
  let equivalent: number;
  try { equivalent = convertMoney(amount, currency, target, tenant.fxRatesKzt); }
  catch { return null; }
  return <div className="body-sm muted" dir="ltr">≈ {formatBillingAmount(equivalent, target, locale)}</div>;
}
