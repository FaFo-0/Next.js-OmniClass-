"use client";
import { usePathname } from "next/navigation";
import { MobileSidebarProvider } from "@/components/layout/mobile-sidebar";
import { RoleGuard } from "@/components/auth/role-guard";
import { PortalShell } from "@/components/shared/PortalShell";
import { TEACHER_SIDEBAR } from "./sidebar-config";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isLivePage = pathname.includes("/sessions/") && pathname.endsWith("/live");
  const isSharePage = pathname.includes("/share/");
  const fullScreen = isLivePage || isSharePage;

  return (
    <RoleGuard allow={["teacher"]}>
      <MobileSidebarProvider>
        {fullScreen ? (
          children
        ) : (
          <PortalShell sections={TEACHER_SIDEBAR}>{children}</PortalShell>
        )}
      </MobileSidebarProvider>
    </RoleGuard>
  );
}
