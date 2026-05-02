"use client";

import { ClerkProvider, useAuth as useClerkAuth } from "@clerk/nextjs";
import { ruRU, arSA, enUS } from "@clerk/localizations";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { AuthProvider } from "@/lib/auth";
import { LocaleProvider, useLocale } from "@/i18n/provider";
import { BrandProvider } from "@/lib/brand/provider";
import { ReactNode } from "react";

const convex = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL as string
);

const clerkLocalizations = {
  en: enUS,
  ru: ruRU,
  ar: arSA,
} as const;

function ClerkWithLocale({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  const localization = clerkLocalizations[locale] ?? enUS;

  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      localization={localization}
    >
      {children}
    </ClerkProvider>
  );
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <BrandProvider>
      <LocaleProvider>
        <ClerkWithLocale>
          <ConvexProviderWithClerk client={convex} useAuth={useClerkAuth}>
            <AuthProvider>{children}</AuthProvider>
          </ConvexProviderWithClerk>
        </ClerkWithLocale>
      </LocaleProvider>
    </BrandProvider>
  );
}
