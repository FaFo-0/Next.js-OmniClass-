/** Every rate is KZT per one unit of its currency. Transactions freeze this map. */
export type MoneySettings = { baseCurrency?: string; fxRatesKzt?: Record<string, number> };
export type MoneyRow = { amount: number; currency: string; amountBase: number; baseCurrency?: string; fxRatesKzt?: Record<string, number> };

const digitsByCurrency = new Map<string, number>();

/** ISO minor units: JPY has zero, USD two, KWD/BHD three. */
export function currencyDigits(currency: string): number {
  const code = currency.toUpperCase();
  const cached = digitsByCurrency.get(code);
  if (cached !== undefined) return cached;
  const digits = new Intl.NumberFormat("en", { style: "currency", currency: code }).resolvedOptions().maximumFractionDigits ?? 2;
  digitsByCurrency.set(code, digits);
  return digits;
}

export function roundCurrency(amount: number, currency: string): number {
  if (!Number.isFinite(amount)) throw new Error("Amount must be a finite number");
  const factor = 10 ** currencyDigits(currency);
  const scaled = amount * factor;
  if (!Number.isFinite(scaled)) throw new Error("Amount is too large");
  return Math.round(scaled) / factor;
}
export function moneyRate(from: string, to: string, rates: Record<string, number> = {}): number {
  if (from === to) return 1;
  const source = from === "KZT" ? 1 : rates[from];
  const target = to === "KZT" ? 1 : rates[to];
  if (!Number.isFinite(source) || source <= 0 || !Number.isFinite(target) || target <= 0) throw new Error(`Set an exchange rate for ${from} → ${to} in Billing currency settings`);
  return source / target;
}
export function convertMoney(amount: number, from: string, to: string, rates: Record<string, number> = {}): number {
  if (!Number.isFinite(amount)) throw new Error("Amount must be a finite number");
  // Monetary conversion uses the target currency's actual minor units, not
  // the storefront convention of quoting some currencies in whole units.
  return roundCurrency(amount * moneyRate(from, to, rates), to);
}
export function bookedAmount(row: MoneyRow, currency: string): number {
  if (row.baseCurrency === currency) return row.amountBase;
  // Legacy rows have no conversion provenance; only their original currency is safe.
  if (!row.fxRatesKzt && row.currency !== currency) throw new Error("This historical entry has no recorded exchange rate");
  return convertMoney(row.amount, row.currency, currency, row.fxRatesKzt);
}
