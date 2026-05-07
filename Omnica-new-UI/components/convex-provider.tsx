"use client"

import { ConvexReactClient } from "convex/react"
import { ReactNode } from "react"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL!
const convex = new ConvexReactClient(convexUrl)

export { convex }

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return <>{children}</>
}
