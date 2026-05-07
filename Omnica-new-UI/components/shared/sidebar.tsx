"use client"

import React, { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Icon } from "./icons"

interface SidebarItemProps {
  icon: string
  label: string
  href: string
  badge?: number | string
  indent?: boolean
  collapsed?: boolean
}

export function SidebarItem({ icon, label, href, badge, indent, collapsed }: SidebarItemProps) {
  const pathname = usePathname()
  const isActive = pathname === href || (href !== "/portal" && pathname.startsWith(href))

  return (
    <Link
      href={href}
      className="sb-item"
      title={collapsed ? label : undefined}
      style={{
        padding: collapsed ? "10px 0" : indent ? "9px 14px 9px 36px" : "9px 14px",
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
        {icon && <Icon name={icon} size={collapsed ? 20 : 17} />}
        {collapsed && badge != null && badge !== 0 && (
          <span style={{
            position: "absolute", top: -3, right: -5,
            width: 8, height: 8, borderRadius: "50%",
            background: "#FFCA00",
            border: "1.5px solid #2A0850",
          }} />
        )}
      </span>
      {!collapsed && <span style={{ flex: 1, textAlign: "left" as const }}>{label}</span>}
      {!collapsed && badge != null && badge !== 0 && (
        <span className="sb-badge" style={isActive ? { background: "rgba(61,13,107,0.25)", color: "#3D0D6B", fontWeight: 700 } : undefined}>
          {badge}
        </span>
      )}
    </Link>
  )
}

interface SidebarSectionProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
  collapsed?: boolean
}

export function SidebarSection({ title, children, defaultOpen = true, collapsed }: SidebarSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div style={{ marginBottom: 4 }}>
      {!collapsed && (
        <button onClick={() => setOpen(!open)} className="sb-section-header"
          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: "16px 14px 6px", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", color: "rgba(255,202,0,0.4)", background: "none", border: "none", cursor: "pointer" }}>
          <span>{title}</span>
          <Icon name={open ? "chevronDown" : "chevronRight"} size={13} />
        </button>
      )}
      {(!collapsed || open) && (
        <div style={{ display: "flex", flexDirection: "column", gap: collapsed ? 4 : 1 }}>
          {React.Children.map(children, (child) => {
            if (React.isValidElement(child)) {
              return React.cloneElement(child as React.ReactElement<any>, { collapsed })
            }
            return child
          })}
        </div>
      )}
    </div>
  )
}

interface SidebarNavProps {
  children: React.ReactNode
  collapsed?: boolean
}

export function SidebarNav({ children, collapsed }: SidebarNavProps) {
  return (
    <nav style={{ padding: collapsed ? "12px 0" : "12px 8px", flex: 1 }}>
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(child as React.ReactElement<any>, { collapsed })
        }
        return child
      })}
    </nav>
  )
}
