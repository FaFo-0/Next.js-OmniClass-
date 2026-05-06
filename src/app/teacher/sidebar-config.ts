import {
  Home,
  Video,
  Users,
  Calendar,
  BarChart3,
  BookOpen,
} from "lucide-react";
import type { SidebarSection } from "@/components/shared/OmnicSidebar";

export const TEACHER_SIDEBAR: SidebarSection[] = [
  {
    items: [
      { key: "home", href: "/teacher", label: "Home", icon: Home },
      { key: "sessions", href: "/teacher/sessions", label: "Sessions", icon: Video },
      { key: "library", href: "/teacher/library", label: "Library", icon: BookOpen },
      { key: "students", href: "/teacher/students", label: "Students", icon: Users },
      { key: "calendar", href: "/teacher/calendar", label: "Calendar", icon: Calendar },
      { key: "reports", href: "/teacher/reports", label: "Reports", icon: BarChart3 },
    ],
  },
];
