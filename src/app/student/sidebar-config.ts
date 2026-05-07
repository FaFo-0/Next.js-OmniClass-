import type { SidebarSection } from "@/components/shared/OmnicSidebar";
import type { BottomNavItem } from "@/components/shared/BottomNav";

export const STUDENT_SIDEBAR: SidebarSection[] = [
  {
    items: [
      { key: "home", href: "/student", label: "Home", icon: "home" },
      { key: "lessons", href: "/student/lessons", label: "My Lessons", icon: "book" },
      { key: "library", href: "/student/library", label: "Library", icon: "layers" },
      { key: "study", href: "/student/study", label: "Study", icon: "brain" },
      { key: "vocabulary", href: "/student/vocabulary", label: "My Words", icon: "bookmark" },
      { key: "calendar", href: "/student/calendar", label: "Calendar", icon: "calendar" },
      { key: "achievements", href: "/student/achievements", label: "Achievements", icon: "trophy" },
    ],
  },
  {
    items: [
      { key: "profile", href: "/student/profile", label: "Profile", icon: "user" },
    ],
  },
];

export const STUDENT_BOTTOM_NAV: BottomNavItem[] = [
  { key: "home", href: "/student", label: "Home", icon: "home" },
  { key: "lessons", href: "/student/lessons", label: "Lessons", icon: "book" },
  { key: "study", href: "/student/study", label: "Study", icon: "brain" },
  { key: "calendar", href: "/student/calendar", label: "Calendar", icon: "calendar" },
  { key: "profile", href: "/student/profile", label: "Profile", icon: "user" },
];
