"use client";
import { MobileSidebarProvider } from "@/components/layout/mobile-sidebar";
import { RoleGuard } from "@/components/auth/role-guard";
import { PortalShell } from "@/components/shared/PortalShell";
import { TEACHER_SIDEBAR } from "./sidebar-config";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allow={["teacher"]}>
      <MobileSidebarProvider>
        <PortalShell sections={TEACHER_SIDEBAR}>{children}</PortalShell>
      </MobileSidebarProvider>
    </RoleGuard>
  );
}
