"use client";

// Collapsible dark purple sidebar — matches Omnica-new-UI prototype.
// Active items get gold gradient + shadow.

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/shared/icons";

export interface SidebarItem {
  key: string;
  href: string;
  label: string;
  icon: string;
  badge?: number | string;
}

export interface SidebarSection {
  label?: string;
  defaultOpen?: boolean;
  items: SidebarItem[];
}

export function OmnicSidebar({
  sections,
  collapsed,
  onToggle,
  avatarInitials,
  userName,
  userRole,
  homeHref,
  onAvatarClick,
  userSlot,
}: {
  sections: SidebarSection[];
  collapsed: boolean;
  onToggle: () => void;
  avatarInitials?: string;
  userName?: string;
  userRole?: string;
  homeHref?: string;
  onAvatarClick?: () => void;
  userSlot?: React.ReactNode;
}) {
  const pathname = usePathname();
  // Resolve portal home from URL when not explicitly passed.
  const resolvedHome =
    homeHref ??
    (pathname.startsWith("/teacher")
      ? "/teacher"
      : pathname.startsWith("/admin")
        ? "/admin"
        : "/student");

  return (
    <aside
      className="sidebar"
      style={{
        width: collapsed ? 56 : 240,
        transition: "width 0.2s ease",
        overflow: "visible",
      }}
    >
      {/* Logo area */}
      <div style={{
        padding: collapsed ? "12px 0" : "20px 16px 12px",
        borderBottom: "1px solid rgba(255,202,0,0.12)",
        display: "flex",
        alignItems: "center",
        justifyContent: collapsed ? "center" : "space-between",
      }}>
        {collapsed ? (
          <button
            onClick={onToggle}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: "linear-gradient(135deg, #FFCA00, #E6B600)",
              border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 8px rgba(255,202,0,0.3)",
            }}
            title="Expand sidebar"
          >
            <Icon name="chevronRight" size={16} stroke="#4A1075" />
          </button>
        ) : (
          <>
            <Link href={resolvedHome} style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
              <img src="/logo-mark.svg" width={34} height={34} style={{ flexShrink: 0, objectFit: "contain", borderRadius: 6 }} alt="Omnica" />
              <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
                <span style={{ fontFamily: 'Georgia, "Plantagenet Cherokee", serif', fontSize: 17, fontWeight: 700, color: "#FFCA00", letterSpacing: "-0.01em" }}>Omnica</span>
                <span style={{ fontFamily: 'Georgia, "Plantagenet Cherokee", serif', fontSize: 11, color: "rgba(255,202,0,0.65)", letterSpacing: "0.02em", marginTop: 2 }}>.english</span>
              </div>
            </Link>
            <button
              onClick={onToggle}
              style={{
                padding: 4, borderRadius: 6,
                border: "1px solid rgba(255,202,0,0.2)", background: "rgba(255,255,255,0.05)", cursor: "pointer",
                display: "flex", alignItems: "center", opacity: 0.6,
              }}
              title="Collapse sidebar"
            >
              <Icon name="chevronLeft" size={14} stroke="rgba(255,255,255,0.6)" />
            </button>
          </>
        )}
      </div>

      {/* Nav items */}
      <nav style={{ padding: collapsed ? "8px 0" : "4px 8px 12px", flex: 1 }}>
        {sections.map((s, si) => (
          <div key={si}>
            {s.label && !collapsed && (
              <div className="sb-section-header">{s.label}</div>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: collapsed ? 4 : 1 }}>
              {s.items.map((it) => {
                // Portal home pages (/student, /teacher, /admin) only match
                // exactly. Sub-routes match by prefix.
                const isPortalHome = /^\/(student|teacher|admin)$/.test(it.href);
                const isActive = isPortalHome
                  ? pathname === it.href
                  : pathname === it.href || pathname.startsWith(it.href + "/");
                return (
                  <Link
                    key={it.key}
                    href={it.href}
                    className="sb-item"
                    title={collapsed ? it.label : undefined}
                    style={{
                      padding: collapsed ? "10px 0" : "9px 14px",
                      justifyContent: collapsed ? "center" : undefined,
                      position: "relative" as const,
                      width: collapsed ? 56 : undefined,
                      margin: collapsed ? "2px auto" : "2px 0",
                      background: isActive ? "linear-gradient(135deg, #FFCA00 0%, #FFD633 100%)" : undefined,
                      color: isActive ? "#3D0D6B" : undefined,
                      fontWeight: isActive ? 700 : 500,
                      boxShadow: isActive ? "0 2px 12px rgba(255,202,0,0.35)" : undefined,
                    }}
                  >
                    <span style={{ position: "relative", display: "inline-flex" }}>
                      <Icon name={it.icon} size={collapsed ? 20 : 17} />
                      {collapsed && it.badge != null && it.badge !== 0 && (
                        <span style={{
                          position: "absolute", top: -3, right: -5,
                          width: 8, height: 8, borderRadius: "50%",
                          background: "#FFCA00",
                          border: "1.5px solid #2A0850",
                        }} />
                      )}
                    </span>
                    {!collapsed && <span style={{ flex: 1, textAlign: "left" as const }}>{it.label}</span>}
                    {!collapsed && it.badge != null && it.badge !== 0 && (
                      <span
                        className="sb-badge"
                        style={isActive ? { background: "rgba(61,13,107,0.25)", color: "#3D0D6B", fontWeight: 700 } : undefined}
                      >
                        {it.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User avatar at bottom */}
      <div style={{ padding: collapsed ? "8px 4px" : "12px 8px", borderTop: "1px solid rgba(255,202,0,0.12)", display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}>
        {userSlot && (
          <div style={{ display: "flex", alignItems: "center", gap: collapsed ? 0 : 10, width: collapsed ? "auto" : "100%" }}>
            <div style={{ flexShrink: 0 }}>{userSlot}</div>
            {!collapsed && (
              <div style={{ flex: 1, textAlign: "left" as const, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {userName ?? "User"}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "capitalize" }}>
                  {userRole ?? "user"}
                </div>
              </div>
            )}
          </div>
        )}
        {!userSlot && (
        <button onClick={onAvatarClick} style={{
          display: "flex", alignItems: "center", gap: collapsed ? 0 : 10,
          padding: collapsed ? "6px" : "4px 8px 4px 4px",
          borderRadius: collapsed ? 8 : 9999, background: "none", border: "none", cursor: "pointer",
          justifyContent: collapsed ? "center" : undefined,
          width: collapsed ? "auto" : "100%",
          transition: "background 0.12s",
        }}>
          <span className={`avatar ${collapsed ? "avatar-sm" : ""}`} style={{ background: "rgba(255,202,0,0.2)", color: "#FFCA00" }}>
            {avatarInitials ?? "?"}
          </span>
          {!collapsed && (
            <>
              <div style={{ flex: 1, textAlign: "left" as const, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {userName ?? "User"}
                </div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "capitalize" }}>
                  {userRole ?? "student"}
                </div>
              </div>
              <Icon name="chevronRight" size={14} stroke="rgba(255,255,255,0.4)" />
            </>
          )}
        </button>
        )}
      </div>
    </aside>
  );
}
