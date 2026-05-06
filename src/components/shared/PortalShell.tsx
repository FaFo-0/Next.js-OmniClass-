"use client";

// Standard portal layout chrome — yellow canvas band + white sidebar +
// inner content. Each portal layout passes its own sidebar config.

import type { ReactNode } from "react";
import {
  OmnicSidebar,
  type SidebarSection,
} from "./OmnicSidebar";
import { Topbar } from "./Topbar";
import { BottomNav, type BottomNavItem } from "./BottomNav";

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
  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--brand-yellow)" }}
    >
      <div className="flex min-h-screen">
        <OmnicSidebar sections={sections} />
        <div className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <main
            className="flex-1 overflow-y-auto"
            style={{
              background: "var(--app-bg)",
              borderStartStartRadius: 16,
              paddingBottom: bottomNav ? "calc(var(--bottom-nav-h) + 24px)" : 24,
            }}
          >
            {children}
          </main>
        </div>
      </div>
      {bottomNav && <BottomNav items={bottomNav} />}
    </div>
  );
}
