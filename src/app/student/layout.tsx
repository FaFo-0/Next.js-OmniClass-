"use client";

import { MobileSidebarProvider } from "@/components/layout/mobile-sidebar";
import { RoleGuard } from "@/components/auth/role-guard";
import { PortalShell } from "@/components/shared/PortalShell";
import { STUDENT_BOTTOM_NAV, STUDENT_SIDEBAR } from "./sidebar-config";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";

/** Resume a public pack choice after auth/onboarding, without buying anything. */
function ResumePackChoice() {
  const { user } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const ready = user?.role === "student" && user.onboardingComplete === true;
  const pricing = useQuery(api.pricing.getStudentCatalogue, ready && pathname !== "/student/billing" ? {} : "skip");
  useEffect(() => {
    if (!ready || pathname === "/student/billing" || !pricing) return;
    try {
      if (localStorage.getItem("omnica-selected-pack")) {
        if (pricing.openOrder) localStorage.removeItem("omnica-selected-pack");
        else router.replace("/student/billing");
      }
    } catch { /* Storage is optional; ordinary portal navigation still works. */ }
  }, [ready, pathname, pricing, router]);
  return null;
}

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allow={["student"]}>
      <ResumePackChoice />
      <MobileSidebarProvider>
        <PortalShell
          sections={STUDENT_SIDEBAR}
          bottomNav={STUDENT_BOTTOM_NAV}
        >
          {children}
        </PortalShell>
      </MobileSidebarProvider>
    </RoleGuard>
  );
}
