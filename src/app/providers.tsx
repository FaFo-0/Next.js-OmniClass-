"use client";

import { ClerkProvider, useAuth as useClerkAuth } from "@clerk/nextjs";
import { ruRU, arSA, enUS, kkKZ } from "@clerk/localizations";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { ConvexQueryCacheProvider } from "convex-helpers/react/cache/provider";
import { AuthProvider } from "@/lib/auth";
import { LocaleProvider, useLocale } from "@/i18n/provider";
import { LocaleSync } from "@/i18n/LocaleSync";
import { BrandProvider } from "@/lib/brand/provider";
import { ReactNode } from "react";

const convex = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL as string
);

const clerkLocalizations = {
  en: enUS,
  ru: ruRU,
  ar: arSA,
  kk: kkKZ,
} as const;

const clerkLocalizationOverrides = {
  en: {
    signIn: {
      start: {
        title: "Sign in",
        titleCombined: "Sign in",
        subtitle: "Welcome back. Please sign in to continue.",
        subtitleCombined: "Welcome back. Please sign in to continue.",
      },
    },
    signUp: {
      start: {
        title: "Create your account",
        titleCombined: "Create your account",
        subtitle: "Create an account to continue.",
        subtitleCombined: "Create an account to continue.",
      },
    },
  },
  ru: {
    signIn: {
      start: {
        title: "Вход",
        titleCombined: "Вход",
        subtitle: "Добро пожаловать. Войдите, чтобы продолжить.",
        subtitleCombined: "Добро пожаловать. Войдите, чтобы продолжить.",
      },
    },
    signUp: {
      start: {
        title: "Создайте аккаунт",
        titleCombined: "Создайте аккаунт",
        subtitle: "Создайте аккаунт, чтобы продолжить.",
        subtitleCombined: "Создайте аккаунт, чтобы продолжить.",
      },
    },
  },
  ar: {
    signIn: {
      start: {
        title: "تسجيل الدخول",
        titleCombined: "تسجيل الدخول",
        subtitle: "مرحباً بعودتك. يرجى تسجيل الدخول للمتابعة.",
        subtitleCombined: "مرحباً بعودتك. يرجى تسجيل الدخول للمتابعة.",
      },
    },
    signUp: {
      start: {
        title: "إنشاء حساب",
        titleCombined: "إنشاء حساب",
        subtitle: "أنشئ حسابًا للمتابعة.",
        subtitleCombined: "أنشئ حسابًا للمتابعة.",
      },
    },
  },
  kk: {
    signIn: {
      start: {
        title: "Кіру",
        titleCombined: "Кіру",
        subtitle: "Қайта келгеніңізге қуаныштымыз. Жалғастыру үшін кіріңіз.",
        subtitleCombined: "Қайта келгеніңізге қуаныштымыз. Жалғастыру үшін кіріңіз.",
      },
    },
    signUp: {
      start: {
        title: "Аккаунт жасау",
        titleCombined: "Аккаунт жасау",
        subtitle: "Жалғастыру үшін аккаунт жасаңыз.",
        subtitleCombined: "Жалғастыру үшін аккаунт жасаңыз.",
      },
    },
  },
} as const;

function ClerkWithLocale({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  const localization = clerkLocalizations[locale as keyof typeof clerkLocalizations] ?? enUS;
  const overrides = clerkLocalizationOverrides[locale as keyof typeof clerkLocalizationOverrides] ?? clerkLocalizationOverrides.en;

  return (
    <ClerkProvider
      publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}
      localization={{
        ...localization,
        signIn: {
          ...localization.signIn,
          start: {
            ...localization.signIn?.start,
            ...overrides.signIn.start,
          },
        },
        signUp: {
          ...localization.signUp,
          start: {
            ...localization.signUp?.start,
            ...overrides.signUp.start,
          },
        },
      }}
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
              <LocaleSync />
              <BrandProvider>{children}</BrandProvider>
            </AuthProvider>
          </ConvexQueryCacheProvider>
        </ConvexProviderWithClerk>
      </ClerkWithLocale>
    </LocaleProvider>
  );
}
