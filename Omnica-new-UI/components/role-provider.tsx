"use client"

import { createContext, useContext, useState, ReactNode } from "react"

type Role = "student" | "teacher" | "admin"

const RoleContext = createContext<{ role: Role; setRole: (r: Role) => void }>({
  role: "student",
  setRole: () => {},
})

export function useRole() {
  return useContext(RoleContext)
}

export function RoleProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>("student")
  return <RoleContext.Provider value={{ role, setRole }}>{children}</RoleContext.Provider>
}
