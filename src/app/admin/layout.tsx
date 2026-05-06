"use client";
import { MobileSidebarProvider } from "@/components/layout/mobile-sidebar";
import { RoleGuard } from "@/components/auth/role-guard";
import { PortalShell } from "@/components/shared/PortalShell";
import { ADMIN_SIDEBAR } from "./sidebar-config";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allow={["admin"]}>
      <MobileSidebarProvider>
        <PortalShell sections={ADMIN_SIDEBAR}>{children}</PortalShell>
      </MobileSidebarProvider>
    </RoleGuard>
  );
}
