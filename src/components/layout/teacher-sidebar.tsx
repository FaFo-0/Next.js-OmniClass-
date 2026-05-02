"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LayoutDashboard, Users, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { MobileSidebarDrawer, useMobileSidebar } from "./mobile-sidebar";
import { useBrand } from "@/lib/brand/provider";

// Each item's `key` matches a `ModuleDef.key` in tenant config.
// Disabling the module hides the item without code change.
const navItems = [
  { key: "dashboard", href: "/teacher", labelKey: "dashboard" as const, icon: LayoutDashboard },
  { key: "students", href: "/teacher", labelKey: "students" as const, icon: Users },
  { key: "calendar", href: "/teacher/calendar", labelKey: "calendar" as const, icon: CalendarDays },
];

function SidebarNav() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const { setOpen } = useMobileSidebar();
  const { module } = useBrand();
  const visibleItems = navItems.filter((item) => module(item.key)?.enabled !== false);

  return (
    <>
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/">
          <Logo />
        </Link>
      </div>

      <nav className="flex flex-col gap-1 p-3">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            item.href === "/teacher"
              ? pathname === "/teacher"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.labelKey}
              href={item.href}
              onClick={() => setOpen(false)}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export function TeacherSidebar() {
  return (
    <>
      <aside className="hidden w-60 shrink-0 border-e bg-sidebar md:block">
        <SidebarNav />
      </aside>
      <MobileSidebarDrawer>
        <SidebarNav />
      </MobileSidebarDrawer>
    </>
  );
}
