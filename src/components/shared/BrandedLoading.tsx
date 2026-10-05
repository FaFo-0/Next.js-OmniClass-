"use client";

import { Logo } from "@/components/layout/logo";
import { useBrand } from "@/lib/brand/provider";

/**
 * Branded loading placeholder for student/teacher/admin portals.
 * Stay tenant-neutral until the active brand query resolves. Once resolved,
 * Logo keeps a real tenant upload and name authoritative.
 */
export function BrandedLoading() {
  const { isLoading } = useBrand();

  return (
    <div className="flex min-h-12 min-w-0 items-center justify-center" role="status" aria-label="Loading">
      {isLoading ? (
        <span className="h-9 w-9 animate-pulse rounded-xl bg-muted" aria-hidden="true" />
      ) : (
        <Logo size="md" />
      )}
    </div>
  );
}
