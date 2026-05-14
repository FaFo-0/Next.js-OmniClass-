"use client";

import { useQuery } from "convex/react";
import { api } from "@convex";
import { formatPrice, type TenantCurrency } from "./currency";

/**
 * Convenience hook for formatting prices in the tenant's primary
 * currency. Tenant settings are auto-fetched once; subsequent
 * `format()` calls are synchronous.
 */
export function useCurrency() {
  const tenant = useQuery(api.tenantSettings.getActive, {});
  const currencies = (tenant?.currencies ?? null) as TenantCurrency[] | null;

  return {
    currencies,
    format: (usdAmount: number, overrideCode?: string) =>
      formatPrice(usdAmount, { currencies, overrideCode }),
  };
}
