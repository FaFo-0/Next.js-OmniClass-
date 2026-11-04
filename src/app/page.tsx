import type { Metadata } from "next";
import { Suspense } from "react";
import { LANDING_COPY } from "@/lib/publicLandingCopy";
import { PUBLIC_SHARE_CARD } from "@/lib/publicShareCard";
import { resolveLandingLocale } from "@/lib/publicLandingLocale";
import { LandingPageClient } from "./landing-page-client";

type Params = Promise<{ lang?: string }>;
export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const locale = resolveLandingLocale(new URLSearchParams(await searchParams));
  const copy = LANDING_COPY[locale];
  // The document title follows the landing language. The shared link-preview
  // card stays brand-first and English (see src/lib/publicShareCard.ts); it must
  // be set explicitly because Next derives og:title from the page title otherwise.
  return {
    title: `${copy.heroA} ${copy.heroB} — Omnica English`,
    description: copy.hero,
    openGraph: {
      title: PUBLIC_SHARE_CARD.title,
      description: PUBLIC_SHARE_CARD.description,
      locale: { ru: "ru_RU", kk: "kk_KZ", en: "en_US", ar: "ar_SA" }[locale],
    },
  };
}

export default function LandingPage() {
  return <Suspense fallback={<div className="min-h-screen bg-[#faf7ef]" />}><LandingPageClient /></Suspense>;
}
