"use client";

// Mobile bottom nav for the student portal.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";

export interface BottomNavItem {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
}

export function BottomNav({ items }: { items: BottomNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t flex"
      style={{
        height: "var(--bottom-nav-h)",
        borderColor: "var(--omnic-gray-100)",
      }}
    >
      {items.map((it) => {
        const active =
          pathname === it.href ||
          (it.href !== "/" && pathname.startsWith(it.href + "/"));
        const Icon = it.icon;
        return (
          <Link
            key={it.key}
            href={it.href}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 text-xs"
            style={{
              color: active ? "var(--brand-purple)" : "var(--omnic-gray-500)",
            }}
          >
            <Icon size={20} />
            <span>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
