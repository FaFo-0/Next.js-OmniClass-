import type { Metadata } from "next";
import { Suspense } from "react";
import { LANDING_COPY } from "@/lib/publicLandingCopy";
import { resolveLandingLocale } from "@/lib/publicLandingLocale";
import { LandingPageClient } from "./landing-page-client";

type Params = Promise<{ lang?: string }>;
export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const locale = resolveLandingLocale(new URLSearchParams(await searchParams));
  const copy = LANDING_COPY[locale];
  return { title: `${copy.heroA} ${copy.heroB} — Omnica English`, description: copy.hero, openGraph: { title: `${copy.heroA} ${copy.heroB} — Omnica English`, description: copy.hero, locale: { ru: "ru_RU", kk: "kk_KZ", en: "en_US" }[locale] } };
}

export default function LandingPage() {
  return <Suspense fallback={<div className="min-h-screen bg-[#faf7ef]" />}><LandingPageClient /></Suspense>;
}
