"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { Icon } from "@/components/shared/icons";
import {
  OmnicSidebar,
  type SidebarSection,
} from "./OmnicSidebar";
import { Topbar } from "./Topbar";
import { BottomNav, type BottomNavItem } from "./BottomNav";
import { useAuth } from "@/lib/auth";
import { useBrand } from "@/lib/brand/provider";

interface PortalShellProps {
  sections: SidebarSection[];
  bottomNav?: BottomNavItem[];
  children: ReactNode;
}

export function PortalShell({
  sections: rawSections,
  bottomNav,
  children,
}: PortalShellProps) {
  const { user } = useAuth();
  const { feature } = useBrand();

  // Items tagged with a tenant feature flag disappear when it's off.
  const sections = rawSections
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => !i.feature || feature(i.feature)),
    }))
    .filter((s) => s.items.length > 0);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  // Z.X-8 — below 768px the sidebar is an off-canvas drawer
  const [drawerOpen, setDrawerOpen] = useState(false);
  const pathname = usePathname();

  // navigating closes the drawer, otherwise it hides the page you just opened
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  // Escape closes it too
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  const initials = user?.name
    ?.split(" ")
    .map((n: string) => n[0])
    .join("") ?? "?";

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {drawerOpen && (
        <div
          className="sidebar-scrim"
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />
      )}

      <OmnicSidebar
        sections={sections}
        className={drawerOpen ? "sidebar-open" : undefined}
        collapsed={!sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        avatarInitials={initials}
        userName={user?.name}
        userRole={user?.role}
        userSlot={
          <UserButton
            appearance={{
              elements: {
                userButtonAvatarBox: "h-7 w-7 ring-2 ring-[rgba(255,202,0,0.35)]",
                userButtonTrigger:
                  "rounded-full focus:shadow-none focus:outline-none",
                userButtonBox: "h-7 w-7",
              },
            }}
          >
            {/* One menu behind the picture: the academy profile sits next to
                Clerk's own "Manage account" and "Sign out", instead of the two
                living in different corners of the app. */}
            <UserButton.MenuItems>
              <UserButton.Link
                label="Profile"
                labelIcon={<Icon name="user" size={14} />}
                href={`/${user?.role ?? "student"}/profile`}
              />
              <UserButton.Action label="manageAccount" />
              <UserButton.Action label="signOut" />
            </UserButton.MenuItems>
          </UserButton>
        }
      />

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        <Topbar onOpenNav={() => setDrawerOpen(true)} />
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
