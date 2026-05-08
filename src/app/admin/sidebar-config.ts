import type { SidebarSection } from "@/components/shared/OmnicSidebar";

export const ADMIN_SIDEBAR: SidebarSection[] = [
  {
    items: [
      { key: "dashboard", href: "/admin", label: "Dashboard", icon: "home" },
      { key: "people", href: "/admin/people", label: "People", icon: "users" },
      { key: "sessions", href: "/admin/sessions", label: "Sessions", icon: "video" },
      { key: "library", href: "/admin/library", label: "Library", icon: "layers" },
      { key: "calendar", href: "/admin/calendar", label: "Calendar", icon: "calendar" },
      { key: "billing", href: "/admin/billing", label: "Billing", icon: "dollar" },
      { key: "settings", href: "/admin/settings", label: "Settings", icon: "settings" },
    ],
  },
];
