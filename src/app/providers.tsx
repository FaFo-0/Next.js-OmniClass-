"use client";

import { ClerkProvider, useAuth as useClerkAuth } from "@clerk/nextjs";
import { ruRU, arSA, enUS } from "@clerk/localizations";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache/provider";
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
    <LocaleProvider>
      <ClerkWithLocale>
        <ConvexProviderWithClerk client={convex} useAuth={useClerkAuth}>
          {/* Without this, every query unsubscribes the moment a page
              unmounts, so switching tabs and coming back refetches from
              scratch and the UI sits empty for a beat. The cache keeps
              subscriptions warm for a few minutes, which makes repeat
              navigation instant. */}
          <ConvexQueryCacheProvider expiration={300_000}>
            <AuthProvider>
              <BrandProvider>{children}</BrandProvider>
            </AuthProvider>
          </ConvexQueryCacheProvider>
        </ConvexProviderWithClerk>
      </ClerkWithLocale>
    </LocaleProvider>
  );
}
