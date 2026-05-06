"use client";

import { useBrand } from "@/lib/brand/provider";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/PageHeader";

export default function TeacherLanding() {
  const { user } = useAuth();
  const { tenantBrand } = useBrand();
  const first = user?.name?.split(" ")[0] ?? "Teacher";
  return (
    <div className="p-6 max-w-5xl mx-auto">
      <PageHeader
        title={`${first}'s dashboard`}
        subtitle={`${tenantBrand.name} teacher portal`}
      />
      <div className="rounded-xl border bg-white p-6 space-y-2">
        <h2 className="text-lg font-semibold">Phase B landing</h2>
        <p className="text-sm text-zinc-600">
          Sessions, library, students, calendar, reports rebuild in Phases
          C–F per <code>MASTER_PLAN.md</code>. Live lesson dashboard ships in
          Phase D.
        </p>
      </div>
    </div>
  );
}
