"use client"

import { createContext, useContext, useEffect, useState } from "react"

interface TenantConfig {
  name: string
  primaryColor: string
  tagline: string
  logo?: string
  gamificationEnabled: boolean
  terminology: Record<string, string>
}

const defaultTenant: TenantConfig = {
  name: "Omnica English",
  primaryColor: "#16A34A",
  tagline: "Master English with confidence",
  gamificationEnabled: true,
  terminology: {},
}

const TenantContext = createContext<TenantConfig>(defaultTenant)

export function useTenant() {
  return useContext(TenantContext)
}

export function TenantProvider({ children }: { children: React.ReactNode }) {
  const [tenant, setTenant] = useState<TenantConfig>(defaultTenant)

  useEffect(() => {
    const hostname = window.location.hostname
    document.documentElement.style.setProperty("--omnic-tenant-primary", tenant.primaryColor)
    document.documentElement.style.setProperty(
      "--omnic-tenant-primary-light",
      `${tenant.primaryColor}26`
    )
    document.documentElement.style.setProperty(
      "--omnic-tenant-primary-hover",
      tenant.primaryColor
    )
  }, [tenant])

  return <TenantContext.Provider value={tenant}>{children}</TenantContext.Provider>
}
