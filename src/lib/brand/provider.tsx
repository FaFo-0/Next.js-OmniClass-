"use client";

import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import {
  SOFTWARE_BRAND,
  type ModuleDef,
  type Permission,
  type RoleDef,
  type SoftwareBrand,
  type TenantBrand,
} from "./config";
import { CURRENT_TENANT_BRAND } from "./current-tenant-brand";
import {
  findModule,
  findRole,
  formatDate,
  formatDateTime,
  formatMoney,
  formatTime,
  isFeatureEnabled,
  modulesForPortal,
  roleHasPermission,
  term,
} from "./helpers";

interface BrandContextValue {
  softwareBrand: SoftwareBrand;
  tenantBrand: TenantBrand;
  // Convenience accessors bound to the current tenant
  terms: TenantBrand["terminology"];
  t: (key: string) => string;
  money: (amount: number, code?: string) => string;
  date: (iso: string | Date, options?: Intl.DateTimeFormatOptions) => string;
  time: (iso: string | Date) => string;
  dateTime: (iso: string | Date) => string;
  feature: (key: string) => boolean;
  modulesIn: (portal: "admin" | "teacher" | "student") => ModuleDef[];
  module: (key: string) => ModuleDef | undefined;
  role: (key: string) => RoleDef | undefined;
  roleCan: (roleKey: string, permission: Permission) => boolean;
}

const defaultValue: BrandContextValue = buildContextValue(CURRENT_TENANT_BRAND);

const BrandContext = createContext<BrandContextValue>(defaultValue);

function buildContextValue(tenantBrand: TenantBrand): BrandContextValue {
  return {
    softwareBrand: SOFTWARE_BRAND,
    tenantBrand,
    terms: tenantBrand.terminology,
    t: (key) => term(tenantBrand.terminology, key),
    money: (amount, code) => formatMoney(tenantBrand, amount, code),
    date: (iso, options) => formatDate(tenantBrand.region, iso, options),
    time: (iso) => formatTime(tenantBrand.region, iso),
    dateTime: (iso) => formatDateTime(tenantBrand.region, iso),
    feature: (key) => isFeatureEnabled(tenantBrand, key),
    modulesIn: (portal) => modulesForPortal(tenantBrand, portal),
    module: (key) => findModule(tenantBrand, key),
    role: (key) => findRole(tenantBrand, key),
    roleCan: (roleKey, permission) =>
      roleHasPermission(tenantBrand, roleKey, permission),
  };
}

/**
 * Inject `tenantBrand.primaryColor` as the `--primary` CSS var on
 * `<html>` so a tenant can override the default green at runtime
 * without a build. No-op when the field is not set.
 */
function useInjectPrimaryColor(primaryColor: string | undefined) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (primaryColor) {
      root.style.setProperty("--primary", primaryColor);
      root.style.setProperty("--ring", primaryColor);
    } else {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--ring");
    }
  }, [primaryColor]);
}

export function BrandProvider({ children }: { children: ReactNode }) {
  const tenantBrand = CURRENT_TENANT_BRAND;
  useInjectPrimaryColor(tenantBrand.primaryColor);
  const value = useMemo(() => buildContextValue(tenantBrand), [tenantBrand]);
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

export function useBrand() {
  return useContext(BrandContext);
}

/**
 * Shortcut for terminology lookup. Equivalent to `useBrand().t(key)`.
 *
 *   const t = useTerm();
 *   <h1>{t("students")}</h1>   // "Students" / "Members" / "Clients"
 */
export function useTerm() {
  return useBrand().t;
}
