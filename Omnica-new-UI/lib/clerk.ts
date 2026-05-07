import { clerkClient } from "@clerk/nextjs/server"

export async function getTenantFromOrg() {
  const client = await clerkClient()
  return client
}

export type TenantRole = "student" | "instructor" | "admin" | "super_admin"

export const ROLE_PAGE_MAP: Record<TenantRole, string> = {
  student: "/portal",
  instructor: "/portal",
  admin: "/portal",
  super_admin: "/portal",
}
