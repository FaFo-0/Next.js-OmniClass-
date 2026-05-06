// Admin sidebar configuration. Routes wired to Phase F pages where
// available; Phase A-E placeholders point at /admin until rebuilt.

import {
  LayoutDashboard,
  Users,
  BarChart3,
  Video,
  CreditCard,
  Sparkles,
  Trophy,
  CalendarCog,
  Palette,
  Shield,
  BookOpen,
  ExternalLink,
} from "lucide-react";
import type { SidebarSection } from "@/components/shared/OmnicSidebar";

export const ADMIN_SIDEBAR: SidebarSection[] = [
  {
    items: [
      { key: "dashboard", href: "/admin", label: "Dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "People",
    defaultOpen: true,
    items: [
      { key: "people", href: "/admin/people", label: "All People", icon: Users },
      {
        key: "people-analytics",
        href: "/admin/people/analytics",
        label: "Analytics",
        icon: BarChart3,
      },
    ],
  },
  {
    items: [
      { key: "sessions", href: "/admin/sessions", label: "Sessions", icon: Video },
      { key: "library", href: "/admin/library", label: "Library", icon: BookOpen },
      { key: "billing", href: "/admin/billing", label: "Billing", icon: CreditCard },
    ],
  },
  {
    label: "Settings",
    defaultOpen: true,
    items: [
      { key: "ai", href: "/admin/ai", label: "AI Manager", icon: Sparkles },
      {
        key: "achievements",
        href: "/admin/achievements",
        label: "Achievements",
        icon: Trophy,
      },
      {
        key: "scheduling",
        href: "/admin/scheduling",
        label: "Scheduling",
        icon: CalendarCog,
      },
      {
        key: "branding",
        href: "/admin/branding",
        label: "Branding",
        icon: Palette,
      },
      {
        key: "permissions",
        href: "/admin/permissions",
        label: "Permissions",
        icon: Shield,
      },
    ],
  },
];

// Used by both teacher + student footers (sidebar.footer slot).
export const EXTERNAL_LINK_ICON = ExternalLink;
