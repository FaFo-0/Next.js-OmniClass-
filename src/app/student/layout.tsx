"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { StudentSidebar } from "@/components/layout/student-sidebar";
import { Topbar } from "@/components/layout/topbar";
import { MobileSidebarProvider } from "@/components/layout/mobile-sidebar";
import { RoleGuard } from "@/components/auth/role-guard";

export default function StudentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, isLoaded } = useAuth();

  // Onboarding only applies to genuine students — admins impersonating skip it.
  useEffect(() => {
    if (!isLoaded || !user) return;
    if (user.role === "student" && !user.onboardingComplete) {
      router.replace("/onboarding");
    }
  }, [isLoaded, user, router]);

  if (!isLoaded || (user?.role === "student" && !user.onboardingComplete)) {
    return null;
  }

  return (
    <RoleGuard allow={["student"]}>
      <MobileSidebarProvider>
        <div className="flex h-screen">
          <StudentSidebar />
          <div className="flex flex-1 flex-col overflow-hidden">
            <Topbar />
            <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
          </div>
        </div>
      </MobileSidebarProvider>
    </RoleGuard>
  );
}
