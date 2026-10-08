/** Every rate is KZT per one unit of its currency. Transactions freeze this map. */
export type MoneySettings = { baseCurrency?: string; fxRatesKzt?: Record<string, number> };
export type MoneyRow = { amount: number; currency: string; amountBase: number; baseCurrency?: string; fxRatesKzt?: Record<string, number> };
export function moneyRate(from: string, to: string, rates: Record<string, number> = {}): number {
  if (from === to) return 1;
  const source = from === "KZT" ? 1 : rates[from];
  const target = to === "KZT" ? 1 : rates[to];
  if (!Number.isFinite(source) || source <= 0 || !Number.isFinite(target) || target <= 0) throw new Error(`Set an exchange rate for ${from} → ${to} in Billing currency settings`);
  return source / target;
}
export function convertMoney(amount: number, from: string, to: string, rates: Record<string, number> = {}): number {
  if (!Number.isFinite(amount)) throw new Error("Amount must be a finite number");
  return Math.round(amount * moneyRate(from, to, rates) * 100) / 100;
}
export function bookedAmount(row: MoneyRow, currency: string): number {
  if (row.baseCurrency === currency) return row.amountBase;
  // Legacy rows have no conversion provenance; only their original currency is safe.
  if (!row.fxRatesKzt && row.currency !== currency) throw new Error("This historical entry has no recorded exchange rate");
  return convertMoney(row.amount, row.currency, currency, row.fxRatesKzt);
}
