import { Suspense } from "react";
import { LandingPageClient } from "./landing-page-client";

export default function LandingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#fffaf0]" />}>
      <LandingPageClient />
    </Suspense>
  );
}
