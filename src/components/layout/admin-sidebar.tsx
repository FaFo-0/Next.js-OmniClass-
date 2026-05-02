"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Users,
  Sparkles,
  Trophy,
  CalendarDays,
  Award,
  CreditCard,
  BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { MobileSidebarDrawer, useMobileSidebar } from "./mobile-sidebar";
import { useBrand } from "@/lib/brand/provider";

// Each item's `key` matches a `ModuleDef.key` in tenant config.
// Sidebar hides an item when `module(key)?.enabled === false`, so
// disabling a module-area in the tenant config drops it from the
// sidebar without code change.
const navItems = [
  { key: "dashboard", href: "/admin", labelKey: "dashboard" as const, icon: LayoutDashboard },
  { key: "users", href: "/admin/users", labelKey: "users" as const, icon: Users },
  { key: "studentsCRM", href: "/admin/students", labelKey: "studentsCRM" as const, icon: CreditCard },
  { key: "analytics", href: "/admin/analytics", labelKey: "analytics" as const, icon: BarChart3 },
  { key: "aiManager", href: "/admin/ai", labelKey: "aiManager" as const, icon: Sparkles },
  { key: "achievements", href: "/admin/achievements", labelKey: "achievements" as const, icon: Trophy },
  { key: "scheduling", href: "/admin/scheduling", labelKey: "scheduling" as const, icon: CalendarDays },
  { key: "certificates", href: "/admin/certificates", labelKey: "certificates" as const, icon: Award },
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
            item.href === "/admin"
              ? pathname === "/admin"
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

export function AdminSidebar() {
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
