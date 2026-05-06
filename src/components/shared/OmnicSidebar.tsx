"use client";

// Shared sidebar shell. Each portal feeds it a `sections` array.
// Active item gets a 3px purple left-border + tinted background per
// `omnic-portal/project/components.jsx`.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Logo } from "@/components/layout/logo";

export interface SidebarItem {
  key: string;
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number | string;
  external?: boolean;
}

export interface SidebarSection {
  /** Optional collapsible heading. Omit for a flat top group. */
  label?: string;
  defaultOpen?: boolean;
  items: SidebarItem[];
}

export function OmnicSidebar({
  sections,
  footer,
}: {
  sections: SidebarSection[];
  footer?: ReactNode;
}) {
  return (
    <aside
      className="hidden md:flex flex-col h-screen sticky top-0 border-e bg-white"
      style={{
        width: "var(--sidebar-w)",
        borderColor: "var(--omnic-gray-100)",
      }}
    >
      <div
        className="px-4 h-14 flex items-center border-b"
        style={{ borderColor: "var(--omnic-gray-100)" }}
      >
        <Logo size="sm" />
      </div>
      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        {sections.map((s, i) =>
          s.label ? (
            <CollapsibleSection key={i} section={s} />
          ) : (
            <div key={i} className="space-y-0.5">
              {s.items.map((it) => (
                <Item key={it.key} item={it} />
              ))}
            </div>
          )
        )}
      </nav>
      {footer && (
        <div
          className="border-t p-3"
          style={{ borderColor: "var(--omnic-gray-100)" }}
        >
          {footer}
        </div>
      )}
    </aside>
  );
}

function CollapsibleSection({ section }: { section: SidebarSection }) {
  const [open, setOpen] = useState(section.defaultOpen ?? true);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide"
        style={{ color: "var(--omnic-gray-500)" }}
      >
        <span>{section.label}</span>
        {open ? (
          <ChevronDown size={13} />
        ) : (
          <ChevronRight size={13} />
        )}
      </button>
      {open && (
        <div className="space-y-0.5 mt-0.5">
          {section.items.map((it) => (
            <Item key={it.key} item={it} indent />
          ))}
        </div>
      )}
    </div>
  );
}

function Item({ item, indent }: { item: SidebarItem; indent?: boolean }) {
  const pathname = usePathname();
  const isActive =
    pathname === item.href ||
    (item.href !== "/" && pathname.startsWith(item.href + "/"));
  const Icon = item.icon;

  const baseStyle: React.CSSProperties = {
    paddingInlineStart: indent ? 36 : 14,
  };
  const activeStyle: React.CSSProperties = isActive
    ? {
        background: "var(--brand-purple-tint)",
        color: "var(--brand-purple)",
        borderInlineStart: "3px solid var(--brand-purple)",
        paddingInlineStart: indent ? 33 : 11,
        fontWeight: 600,
      }
    : {};

  return (
    <Link
      href={item.href}
      target={item.external ? "_blank" : undefined}
      className="flex items-center gap-2.5 h-9 pe-3 rounded-md text-sm transition-colors hover:bg-zinc-100"
      style={{ ...baseStyle, ...activeStyle }}
    >
      <Icon size={17} />
      <span className="flex-1 text-start">{item.label}</span>
      {item.badge != null && item.badge !== 0 && (
        <span
          className="text-xs px-1.5 py-0.5 rounded"
          style={
            isActive
              ? { background: "var(--brand-purple)", color: "white" }
              : { background: "var(--omnic-gray-200)", color: "var(--omnic-gray-700)" }
          }
        >
          {item.badge}
        </span>
      )}
    </Link>
  );
}
