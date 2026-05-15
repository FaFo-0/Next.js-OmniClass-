import type { SidebarSection } from "@/components/shared/OmnicSidebar";

export const TEACHER_SIDEBAR: SidebarSection[] = [
  {
    items: [
      { key: "home", href: "/teacher", label: "Home", icon: "home" },
      { key: "sessions", href: "/teacher/sessions", label: "Sessions", icon: "video" },
      { key: "library", href: "/teacher/library", label: "Library", icon: "layers" },
      { key: "students", href: "/teacher/students", label: "Students", icon: "users" },
      { key: "calendar", href: "/teacher/calendar", label: "Calendar", icon: "calendar" },
      { key: "reports", href: "/teacher/reports", label: "Reports", icon: "chart" },
    ],
  },
];
