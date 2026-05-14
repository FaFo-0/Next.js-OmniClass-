// H.3 — currency formatting. Tenant defines extra currencies w/ a
// rate-to-USD; we always store prices in USD and convert at display
// time. The "primary display" currency comes from tenantSettings; the
// helper accepts an explicit override for places that always want USD.

export type TenantCurrency = {
  code: string;
  name: string;
  symbol: string;
  rateToUSD: number;
  isPrimaryDisplay: boolean;
  updatedAt: string;
};

const USD_FALLBACK: TenantCurrency = {
  code: "USD",
  name: "US Dollar",
  symbol: "$",
  rateToUSD: 1,
  isPrimaryDisplay: true,
  updatedAt: new Date(0).toISOString(),
};

export function pickPrimary(
  currencies: TenantCurrency[] | undefined | null
): TenantCurrency {
  if (!currencies || currencies.length === 0) return USD_FALLBACK;
  return currencies.find((c) => c.isPrimaryDisplay) ?? currencies[0];
}

export function findCurrency(
  currencies: TenantCurrency[] | undefined | null,
  code: string
): TenantCurrency | undefined {
  return currencies?.find((c) => c.code.toUpperCase() === code.toUpperCase());
}

/**
 * Format a USD-denominated number into the tenant's primary currency
 * (or an explicit override). Handles symbol placement + 0/2-decimal
 * precision based on magnitude.
 */
export function formatPrice(
  usdAmount: number,
  opts: {
    currencies?: TenantCurrency[] | null;
    overrideCode?: string;
    showCode?: boolean; // append "USD" / "KZT" etc.
  } = {}
): string {
  const target = opts.overrideCode
    ? findCurrency(opts.currencies ?? null, opts.overrideCode) ?? USD_FALLBACK
    : pickPrimary(opts.currencies ?? null);

  const converted = usdAmount * target.rateToUSD;
  const decimals = converted >= 100 ? 0 : 2;
  const num = converted.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  const body = `${target.symbol}${num}`;
  return opts.showCode ? `${body} ${target.code}` : body;
}

/**
 * Show price in primary + USD if they differ. Used in admin views
 * where you want both numbers visible at once.
 */
export function formatPriceDual(
  usdAmount: number,
  currencies: TenantCurrency[] | null | undefined
): { primary: string; usd: string | null } {
  const primary = pickPrimary(currencies);
  const primaryFormatted = formatPrice(usdAmount, { currencies });
  if (primary.code === "USD") return { primary: primaryFormatted, usd: null };
  return {
    primary: primaryFormatted,
    usd: formatPrice(usdAmount, { currencies, overrideCode: "USD" }),
  };
}
