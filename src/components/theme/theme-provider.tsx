"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ThemeProvider as NextThemeProvider } from "next-themes";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // Public artwork keeps its designed palette without overwriting the user's choice.
  const publicPage = pathname === "/" || pathname === "/privacy" || pathname === "/terms";
  return (
    <NextThemeProvider
      attribute="class"
      storageKey="omnica-appearance"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      forcedTheme={publicPage ? "light" : undefined}
    >
      {children}
    </NextThemeProvider>
  );
}
