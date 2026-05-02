// Helpers for consuming the agnostic config surface.
//
// All functions are pure — they take config + value, return formatted
// output. Components call them via `useBrand()` (see `./provider.tsx`)
// or directly when running outside React.

import type {
  CurrencyDef,
  ModuleDef,
  Permission,
  RegionConfig,
  RoleDef,
  TenantBrand,
  Terminology,
} from "./config";

// ── Terminology ────────────────────────────────────────────────────

export function term(terms: Terminology, key: string): string {
  return terms[key] ?? key;
}

// ── Currency ───────────────────────────────────────────────────────

export function findCurrency(
  currencies: CurrencyDef[],
  code: string
): CurrencyDef | undefined {
  return currencies.find((c) => c.code === code);
}

/**
 * Convert an amount from one currency to another, going through the
 * base currency. Returns null if either currency is unknown.
 */
export function convertCurrency(
  currencies: CurrencyDef[],
  amount: number,
  fromCode: string,
  toCode: string
): number | null {
  if (fromCode === toCode) return amount;
  const from = findCurrency(currencies, fromCode);
  const to = findCurrency(currencies, toCode);
  if (!from || !to) return null;
  // amount * (1 / from.rateToBase) gives base units; * to.rateToBase
  // would invert. Convention here: rateToBase = "this currency per
  // 1 unit of base" — to get base: amount / rateToBase.
  const base = amount / from.rateToBase;
  return base * to.rateToBase;
}

/**
 * Format an amount in a given currency using the tenant's locale.
 * Falls back to the symbol + raw number if the currency is unknown.
 */
export function formatMoney(
  brand: TenantBrand,
  amount: number,
  code?: string
): string {
  const targetCode = code ?? brand.baseCurrency;
  const currency = findCurrency(brand.currencies, targetCode);
  if (!currency) return `${amount.toFixed(2)} ${targetCode}`;

  // Try Intl first — handles ISO 4217 codes natively.
  try {
    return new Intl.NumberFormat(brand.region.locale, {
      style: "currency",
      currency: currency.code,
      minimumFractionDigits: currency.decimals,
      maximumFractionDigits: currency.decimals,
    }).format(amount);
  } catch {
    // Custom code (e.g. "points") — Intl rejects it. Hand-format.
    const formatted = new Intl.NumberFormat(brand.region.locale, {
      minimumFractionDigits: currency.decimals,
      maximumFractionDigits: currency.decimals,
    }).format(amount);
    return `${currency.symbol}${formatted}`;
  }
}

// ── Date / time ────────────────────────────────────────────────────

export function formatDate(
  region: RegionConfig,
  isoOrDate: string | Date,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat(region.locale, {
    timeZone: region.timezone,
    dateStyle: "medium",
    ...options,
  }).format(date);
}

export function formatTime(
  region: RegionConfig,
  isoOrDate: string | Date
): string {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat(region.locale, {
    timeZone: region.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: region.timeFormat === "12h",
  }).format(date);
}

export function formatDateTime(
  region: RegionConfig,
  isoOrDate: string | Date
): string {
  const date = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return new Intl.DateTimeFormat(region.locale, {
    timeZone: region.timezone,
    dateStyle: "medium",
    timeStyle: "short",
    hour12: region.timeFormat === "12h",
  }).format(date);
}

// ── Features ───────────────────────────────────────────────────────

/**
 * Treat missing keys as enabled. Explicit `false` disables.
 * Lets new code reference unknown flags without breaking old configs.
 */
export function isFeatureEnabled(
  brand: TenantBrand,
  key: string
): boolean {
  return brand.features[key] !== false;
}

// ── Modules ────────────────────────────────────────────────────────

export function modulesForPortal(
  brand: TenantBrand,
  portal: "admin" | "teacher" | "student"
): ModuleDef[] {
  return brand.modules
    .filter((m) => m.enabled)
    .filter((m) => !m.portals || m.portals.includes(portal))
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export function findModule(
  brand: TenantBrand,
  key: string
): ModuleDef | undefined {
  return brand.modules.find((m) => m.key === key);
}

// ── Roles + permissions ────────────────────────────────────────────

export function findRole(
  brand: TenantBrand,
  roleKey: string
): RoleDef | undefined {
  return brand.roles.find((r) => r.key === roleKey);
}

/**
 * Does the given role carry the given permission key?
 * Unknown role → false. Unknown permission key → respects what the
 * role declares (no automatic grant).
 */
export function roleHasPermission(
  brand: TenantBrand,
  roleKey: string,
  permission: Permission
): boolean {
  const role = findRole(brand, roleKey);
  if (!role) return false;
  return role.permissions.includes(permission);
}
