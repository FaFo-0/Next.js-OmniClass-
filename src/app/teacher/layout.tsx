"use client";
import { TeacherBrowserGate } from "@/components/auth/teacher-browser-gate";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
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
  const { user } = useAuth();
  const isLivePage = pathname.includes("/sessions/") && pathname.endsWith("/live");
  const isSharePage = pathname.includes("/share/");
  const fullScreen = isLivePage || isSharePage;

  return (
    <RoleGuard allow={["teacher"]}>
      <div translate="no" className="notranslate"><MobileSidebarProvider>
        {fullScreen ? (
          <TeacherBrowserGate role={user?.role}>{children}</TeacherBrowserGate>
        ) : (
          <PortalShell sections={TEACHER_SIDEBAR}>
            <TeacherBrowserGate role={user?.role}>{children}</TeacherBrowserGate>
          </PortalShell>
        )}
      </MobileSidebarProvider></div>
    </RoleGuard>
  );
}
