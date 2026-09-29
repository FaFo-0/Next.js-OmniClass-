import type { Metadata } from "next";
import { Suspense } from "react";
import { LegalShell } from "@/components/public/legal-shell";
import { LEGAL_COPY } from "@/lib/publicLegalCopy";
import { resolveLandingLocale } from "@/lib/publicLandingLocale";

type Params = Promise<{ lang?: string }>;
export async function generateMetadata({ searchParams }: { searchParams: Params }): Promise<Metadata> {
  const locale = resolveLandingLocale(new URLSearchParams(await searchParams));
  const copy = LEGAL_COPY[locale].terms;
  return { title: `${copy.title} — Omnica English`, description: copy.intro };
}

export default function TermsPage() {
  return <Suspense fallback={<div className="min-h-screen bg-[#faf7ef]" />}><LegalShell kind="terms" /></Suspense>;
}
