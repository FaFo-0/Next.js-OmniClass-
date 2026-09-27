"use client";

import { MobileSidebarProvider } from "@/components/layout/mobile-sidebar";
import { RoleGuard } from "@/components/auth/role-guard";
import { PortalShell } from "@/components/shared/PortalShell";
import { STUDENT_BOTTOM_NAV, STUDENT_SIDEBAR } from "./sidebar-config";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allow={["student"]}>
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
