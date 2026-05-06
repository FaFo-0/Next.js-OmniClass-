"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useQuery } from "convex/react";
import { api } from "@convex";
import {
  SOFTWARE_BRAND,
  withDefaults,
  type ModuleDef,
  type Permission,
  type RoleDef,
  type SoftwareBrand,
  type TenantBrand,
} from "./config";
import { OMNICA_BACKGROUND_COLOR, OMNICA_FALLBACK } from "./fallback";
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
  isLoading: boolean;
  hasActiveTenant: boolean;
  // Convenience accessors
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
  // Direct tokens consumers may want
  primaryColor: string;
  backgroundColor: string;
}

function buildContextValue(
  tenantBrand: TenantBrand,
  isLoading: boolean,
  hasActiveTenant: boolean,
  primaryColor: string,
  backgroundColor: string
): BrandContextValue {
  return {
    softwareBrand: SOFTWARE_BRAND,
    tenantBrand,
    isLoading,
    hasActiveTenant,
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
    primaryColor,
    backgroundColor,
  };
}

const fallbackValue: BrandContextValue = buildContextValue(
  OMNICA_FALLBACK,
  true,
  false,
  OMNICA_FALLBACK.primaryColor || "#6716A4",
  OMNICA_BACKGROUND_COLOR
);

const BrandContext = createContext<BrandContextValue>(fallbackValue);

/**
 * Map a Convex `tenantSettings` row into the legacy `TenantBrand` shape
 * consumed by `useBrand()`. Synthesizes the agnostic config layers from
 * the Convex doc + defaults via `withDefaults`.
 */
function tenantSettingsToBrand(
  doc: NonNullable<ReturnType<typeof useTenantSettings>>
): TenantBrand {
  const localeMap: Record<string, string> = {
    en: "en-US",
    ru: "ru-RU",
    ar: "ar-SA",
  };
  return withDefaults({
    name: doc.name,
    tagline: doc.tagline,
    logoUrl: doc.logoUrl,
    logoDarkUrl: doc.logoDarkUrl,
    faviconUrl: doc.faviconUrl,
    primaryColor: doc.primaryColor,
    supportEmail: doc.supportEmail,
    websiteUrl: doc.websiteUrl,
    region: {
      locale: localeMap[doc.defaultLocale] ?? "en-US",
      timezone: doc.timezone,
      timeFormat: "24h",
      firstDayOfWeek: 1,
    },
    baseCurrency: doc.baseCurrency,
    features: {
      gamification: doc.features.gamification,
      achievements: doc.features.achievements,
      library: doc.features.library,
      liveQuizGen: doc.features.liveQuizGen,
      payments: doc.features.payments,
    },
    scheduling: {
      durations: [doc.defaultLessonDurationMinutes],
      defaultDuration: doc.defaultLessonDurationMinutes,
      bufferMinutes: 0,
      allowGroup: false,
      maxGroupSize: 1,
      allowRecurring: true,
      rescheduleWindowHours: doc.rescheduleWindowHours,
      cancelWindowHours: doc.cancelWindowHours,
    },
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function useTenantSettings() {
  // Wrapper exists purely to type the Convex doc. `api.tenantSettings.getActive`
  // returns the row or null while loading / when no org is active.
  return useQuery(api.tenantSettings.getActive);
}

/**
 * Inject brand color tokens (`--primary`, `--ring`, `--brand-yellow`,
 * `--brand-purple`, `--app-bg`) onto `<html>` so theme adapts at runtime
 * without a rebuild. Server-rendered fallback comes from `globals.css`.
 */
function useInjectThemeTokens(primary: string, background: string) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.style.setProperty("--primary", primary);
    root.style.setProperty("--ring", primary);
    root.style.setProperty("--brand-purple", primary);
    root.style.setProperty("--brand-yellow", background);
    root.style.setProperty("--omnic-tenant-primary", primary);
    root.style.setProperty("--omnic-tenant-bg", background);
  }, [primary, background]);
}

export function BrandProvider({ children }: { children: ReactNode }) {
  const settings = useTenantSettings();
  const isLoading = settings === undefined;
  const hasActiveTenant = !!settings;

  const tenantBrand: TenantBrand = useMemo(
    () => (settings ? tenantSettingsToBrand(settings) : OMNICA_FALLBACK),
    [settings]
  );
  const primaryColor = settings?.primaryColor ?? OMNICA_FALLBACK.primaryColor!;
  const backgroundColor =
    settings?.backgroundColor ?? OMNICA_BACKGROUND_COLOR;

  useInjectThemeTokens(primaryColor, backgroundColor);

  const value = useMemo(
    () =>
      buildContextValue(
        tenantBrand,
        isLoading,
        hasActiveTenant,
        primaryColor,
        backgroundColor
      ),
    [tenantBrand, isLoading, hasActiveTenant, primaryColor, backgroundColor]
  );

  return (
    <BrandContext.Provider value={value}>{children}</BrandContext.Provider>
  );
}

export function useBrand() {
  return useContext(BrandContext);
}

/** Shortcut for terminology lookup — equivalent to `useBrand().t(key)`. */
export function useTerm() {
  return useBrand().t;
}
