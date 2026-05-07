"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/shared/icons";

export interface BottomNavItem {
  key: string;
  href: string;
  label: string;
  icon: string;
}

export function BottomNav({ items }: { items: BottomNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="bottom-nav md:hidden">
      {items.map((it) => {
        const active = pathname === it.href || pathname.startsWith(it.href + "/");
        return (
          <Link
            key={it.key}
            href={it.href}
            className={`bn-item ${active ? "bn-item-active" : ""}`}
          >
            <Icon name={it.icon} size={20} />
            <span>{it.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
