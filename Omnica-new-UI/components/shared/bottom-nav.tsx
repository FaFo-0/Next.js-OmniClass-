"use client"

import { usePathname } from "next/navigation"
import Link from "next/link"
import { cn } from "@/lib/utils"
import { Icon } from "@/components/shared/icons"

interface BottomNavItem {
  icon: string
  label: string
  href: string
}

const studentNavItems: BottomNavItem[] = [
  { icon: "home", label: "Home", href: "/portal" },
  { icon: "book", label: "Lessons", href: "/portal/lessons" },
  { icon: "brain", label: "Study", href: "/portal/study" },
  { icon: "calendar", label: "Calendar", href: "/portal/calendar" },
  { icon: "user", label: "Profile", href: "/portal/profile" },
]

export function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-[var(--omnic-gray-100)] z-50 flex items-center justify-around">
      {studentNavItems.map((item) => {
        const isActive = pathname === item.href || pathname.startsWith(item.href + "/")
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 py-2 px-3 text-xs font-medium transition-colors",
              isActive
                ? "text-[var(--omnic-tenant-primary)]"
                : "text-[var(--omnic-gray-400)] hover:text-[var(--omnic-gray-600)]"
            )}
          >
            <Icon name={item.icon} size={20} />
            <span>{item.label}</span>
          </Link>
        )
      })}
    </nav>
  )
}
