// TEMPORARY STUB — Phase 7a.
//
// SINGLE SOURCE OF TRUTH for the active tenant's brand AND agnostic
// configuration (terminology, currency, locale, features, modules,
// roles, scheduling, notifications, public slugs).
//
// ONLY place in the entire codebase where a tenant name literal is
// allowed to appear. Every tenant-facing surface reads this through
// `useBrand()` (see `./provider.tsx`).
//
// To rebrand: edit the identity fields below.
// To retarget a different vertical (gym, therapy, coaching, etc.):
//   1. Override `terminology` (e.g. student → Member, teacher → Trainer).
//   2. Override `currencies` + `baseCurrency` for a different currency set.
//   3. Override `region` for locale / timezone / time format.
//   4. Toggle `features` off for things that don't apply.
//   5. Toggle `modules[].enabled` off for sidebar areas that don't apply.
//   6. Override `roles` to add/remove roles and their permissions.
//   7. Override `scheduling` for the vertical's session shape.
// Everything else stays identical. `withDefaults` fills missing fields.
//
// Later phase replaces this stub with a Convex query that returns the
// active tenant's config per request. The `TenantBrand` shape will not
// change — only the resolution mechanism.

import { withDefaults, type TenantBrand } from "./config";

export const CURRENT_TENANT_BRAND: TenantBrand = withDefaults({
  name: "FluentLap",
  tagline: "Fluent English, one lap at a time",
  logoUrl: "/brand/tenant/logo.svg",
  logoDarkUrl: "/brand/tenant/logo-dark.svg",
  faviconUrl: "/brand/tenant/favicon.svg",
  primaryColor: undefined, // uses globals.css default green
  supportEmail: "hello@example.app",
  websiteUrl: "https://example.app",

  // Legacy data carried over from Moumen's Kyrgyz academy uses KGS in
  // billingRecords.currency / expenses.amount. Keep both currencies
  // registered so existing rows render correctly. baseCurrency stays
  // USD as the canonical unit; rate is updated via the admin
  // analytics page (exchangeRates table) and overrides this default.
  currencies: [
    { code: "USD", symbol: "$", rateToBase: 1, decimals: 2, label: "US Dollar" },
    { code: "KGS", symbol: "с", rateToBase: 87, decimals: 2, label: "Kyrgyzstani som" },
  ],
  baseCurrency: "USD",
});
