"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  LayoutDashboard,
  Map,
  GraduationCap,
  Layers,
  BarChart3,
  Trophy,
  User,
  CalendarDays,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./logo";
import { useAuth } from "@/lib/auth";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { getDueCount } from "@/lib/srs/sm2";
import { MobileSidebarDrawer, useMobileSidebar } from "./mobile-sidebar";
import { useBrand } from "@/lib/brand/provider";

// Each item's `key` matches a `ModuleDef.key` in tenant config.
// Disabling the module hides the item without code change.
// Note: stats labelKey is "statistics" (legacy translation key); module
// key is "stats" — distinct on purpose.
const navItems = [
  { key: "dashboard", href: "/student", labelKey: "dashboard" as const, icon: LayoutDashboard },
  { key: "myLessons", href: "/student/lessons", labelKey: "myLessons" as const, icon: Map },
  { key: "study", href: "/student/study", labelKey: "study" as const, icon: GraduationCap, showDue: true },
  { key: "decks", href: "/student/decks", labelKey: "decks" as const, icon: Layers },
  { key: "calendar", href: "/student/calendar", labelKey: "calendar" as const, icon: CalendarDays },
  { key: "stats", href: "/student/stats", labelKey: "statistics" as const, icon: BarChart3 },
  { key: "achievements", href: "/student/achievements", labelKey: "achievements" as const, icon: Trophy },
  { key: "profile", href: "/student/profile", labelKey: "profile" as const, icon: User },
];

function SidebarNav({ dueCount }: { dueCount: number }) {
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
            item.href === "/student"
              ? pathname === "/student"
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
              <span className="flex-1">{t(item.labelKey)}</span>
              {item.showDue && dueCount > 0 && (
                <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                  {dueCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export function StudentSidebar() {
  const { currentUserId } = useAuth();
  const allLessons = useQuery(
    api.lessons.getPublishedLessonsForStudent,
    currentUserId ? { studentId: currentUserId } : "skip"
  ) ?? [];
  const srsCards = useQuery(
    api.study.getSRSCardsForOwner,
    currentUserId ? { ownerId: currentUserId } : "skip"
  ) ?? [];

  const lessonIds = useMemo(
    () => allLessons.map((l) => l.externalId),
    [allLessons]
  );

  const dueCount = useMemo(() => {
    const studentCards = srsCards.filter((c) => lessonIds.includes(c.deckId));
    return getDueCount(studentCards);
  }, [srsCards, lessonIds]);

  return (
    <>
      <aside className="hidden w-60 shrink-0 border-e bg-sidebar md:block">
        <SidebarNav dueCount={dueCount} />
      </aside>
      <MobileSidebarDrawer>
        <SidebarNav dueCount={dueCount} />
      </MobileSidebarDrawer>
    </>
  );
}
