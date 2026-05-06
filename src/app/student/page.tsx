"use client";

import { useBrand } from "@/lib/brand/provider";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/PageHeader";

export default function StudentLanding() {
  const { user } = useAuth();
  const { tenantBrand } = useBrand();
  const first = user?.name?.split(" ")[0] ?? "there";
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title={`Welcome back, ${first}`}
        subtitle={`${tenantBrand.name} student portal`}
      />
      <div className="rounded-xl border bg-white p-6 space-y-2">
        <h2 className="text-lg font-semibold">Phase B landing</h2>
        <p className="text-sm text-zinc-600">
          Lessons, study, vocabulary, library, calendar, achievements pages
          rebuild in Phase C–F per <code>MASTER_PLAN.md</code>.
        </p>
      </div>
    </div>
  );
}
