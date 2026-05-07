import type { SidebarSection } from "@/components/shared/OmnicSidebar";

export const ADMIN_SIDEBAR: SidebarSection[] = [
  {
    items: [
      { key: "dashboard", href: "/admin", label: "Dashboard", icon: "home" },
    ],
  },
  {
    label: "People",
    defaultOpen: true,
    items: [
      { key: "people", href: "/admin/people", label: "All People", icon: "users" },
      { key: "people-analytics", href: "/admin/people/analytics", label: "Analytics", icon: "chart" },
    ],
  },
  {
    items: [
      { key: "sessions", href: "/admin/sessions", label: "Sessions", icon: "video" },
      { key: "library", href: "/admin/library", label: "Library", icon: "layers" },
      { key: "billing", href: "/admin/billing", label: "Billing", icon: "dollar" },
    ],
  },
  {
    label: "Settings",
    defaultOpen: true,
    items: [
      { key: "ai", href: "/admin/ai", label: "AI Manager", icon: "sparkle" },
      { key: "achievements", href: "/admin/achievements", label: "Achievements", icon: "trophy" },
      { key: "scheduling", href: "/admin/scheduling", label: "Scheduling", icon: "calendar" },
      { key: "branding", href: "/admin/branding", label: "Branding", icon: "settings" },
      { key: "permissions", href: "/admin/permissions", label: "Permissions", icon: "shield" },
    ],
  },
];
