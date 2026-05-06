import {
  Home,
  BookOpen,
  Brain,
  Bookmark,
  Calendar,
  Trophy,
  User,
  Library,
} from "lucide-react";
import type { SidebarSection } from "@/components/shared/OmnicSidebar";
import type { BottomNavItem } from "@/components/shared/BottomNav";

export const STUDENT_SIDEBAR: SidebarSection[] = [
  {
    items: [
      { key: "home", href: "/student", label: "Home", icon: Home },
      { key: "lessons", href: "/student/lessons", label: "My Lessons", icon: BookOpen },
      { key: "study", href: "/student/study", label: "Study", icon: Brain },
      { key: "library", href: "/student/library", label: "Library", icon: Library },
      { key: "vocabulary", href: "/student/vocabulary", label: "My Words", icon: Bookmark },
      { key: "calendar", href: "/student/calendar", label: "Calendar", icon: Calendar },
      { key: "achievements", href: "/student/achievements", label: "Achievements", icon: Trophy },
    ],
  },
];

export const STUDENT_BOTTOM_NAV: BottomNavItem[] = [
  { key: "home", href: "/student", label: "Home", icon: Home },
  { key: "lessons", href: "/student/lessons", label: "Lessons", icon: BookOpen },
  { key: "study", href: "/student/study", label: "Study", icon: Brain },
  { key: "calendar", href: "/student/calendar", label: "Calendar", icon: Calendar },
  { key: "profile", href: "/student/profile", label: "Profile", icon: User },
];
