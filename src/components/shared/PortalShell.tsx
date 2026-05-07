"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  OmnicSidebar,
  type SidebarSection,
} from "./OmnicSidebar";
import { Topbar } from "./Topbar";
import { BottomNav, type BottomNavItem } from "./BottomNav";
import { useAuth } from "@/lib/auth";

interface PortalShellProps {
  sections: SidebarSection[];
  bottomNav?: BottomNavItem[];
  children: ReactNode;
}

export function PortalShell({
  sections,
  bottomNav,
  children,
}: PortalShellProps) {
  const { user } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const initials = user?.name
    ?.split(" ")
    .map((n: string) => n[0])
    .join("") ?? "?";

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <OmnicSidebar
        sections={sections}
        collapsed={!sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        avatarInitials={initials}
        userName={user?.name}
        userRole={user?.role}
      />

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Topbar />
        <main
          className="flex-1 overflow-y-auto"
          style={{
            background: "var(--app-bg)",
            padding: "28px 28px",
            paddingBottom: bottomNav ? "calc(var(--bottom-nav-h) + 28px)" : 28,
          }}
        >
          {children}
        </main>
      </div>

      {bottomNav && <BottomNav items={bottomNav} />}
    </div>
  );
}
