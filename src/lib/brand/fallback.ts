// Static fallback used while Convex `tenantSettings.getActive` is
// loading or when the user has no active organization. Mirrors the
// Omnica English defaults seeded in `convex/tenantSettings.ts`.

import { withDefaults, type TenantBrand } from "./config";

export const OMNICA_FALLBACK: TenantBrand = withDefaults({
  name: "Omnica English",
  tagline: "Speak English with confidence.",
  logoUrl: "/brand/tenant/logo.svg",
  logoDarkUrl: "/brand/tenant/logo-dark.svg",
  faviconUrl: "/brand/tenant/favicon.svg",
  primaryColor: "#6716A4",
  supportEmail: "hello@omnica.app",
  websiteUrl: "https://omnica.app",
  currencies: [
    { code: "USD", symbol: "$", rateToBase: 1, decimals: 2, label: "US Dollar" },
  ],
  baseCurrency: "USD",
  region: {
    locale: "en-US",
    timezone: "Asia/Bishkek",
    timeFormat: "24h",
    firstDayOfWeek: 1,
  },
});

// Derived background canvas color (yellow). Not part of TenantBrand
// today; injected as `--brand-yellow` CSS var alongside primaryColor.
export const OMNICA_BACKGROUND_COLOR = "#FFCA00";
