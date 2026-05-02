import { TeacherSidebar } from "@/components/layout/teacher-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileSidebarProvider } from "@/components/layout/mobile-sidebar";
import { RoleGuard } from "@/components/auth/role-guard";

export default function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoleGuard allow={["teacher"]}>
      <MobileSidebarProvider>
        <div className="flex h-screen">
          <TeacherSidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Topbar />
            <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
          </div>
        </div>
      </MobileSidebarProvider>
    </RoleGuard>
  );
}
