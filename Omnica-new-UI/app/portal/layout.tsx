"use client"

import Link from "next/link"
import { useState, useEffect, useRef } from "react"
import { SidebarItem, SidebarSection } from "@/components/shared/sidebar"
import { BottomNav } from "@/components/shared/bottom-nav"
import { Icon } from "@/components/shared/icons"
import { MOCK } from "@/lib/mock-data"
import { useRole, RoleProvider } from "@/components/role-provider"

function PortalShell({ children }: { children: React.ReactNode }) {
  const { role, setRole } = useRole()
  const m = MOCK
  const profile = role === "student" ? m.student : role === "teacher" ? m.teacher : m.admin

  const [sidebarOpen, setSidebarOpen] = useState(true)
  const collapsed = !sidebarOpen
  const [langOpen, setLangOpen] = useState(false)
  const [roleOpen, setRoleOpen] = useState(false)
  const langRef = useRef<HTMLDivElement>(null)
  const roleRef = useRef<HTMLDivElement>(null)
  const [uiLang, setUiLang] = useState("en")
  const langs = [
    { code: "en", label: "English", flag: "🇬🇧" },
    { code: "es", label: "Español", flag: "🇪🇸" },
    { code: "pt", label: "Português", flag: "🇵🇹" },
    { code: "fr", label: "Français", flag: "🇫🇷" },
    { code: "ar", label: "العربية", flag: "🇸🇦" },
    { code: "tr", label: "Türkçe", flag: "🇹🇷" },
  ]
  const currentLang = langs.find(l => l.code === uiLang) || langs[0]

  useEffect(() => {
    if (!langOpen && !roleOpen) return
    const close = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setLangOpen(false)
      if (roleRef.current && !roleRef.current.contains(e.target as Node)) setRoleOpen(false)
    }
    document.addEventListener("mousedown", close)
    return () => document.removeEventListener("mousedown", close)
  }, [langOpen, roleOpen])

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <aside className="sidebar" style={{ width: collapsed ? 56 : 240, transition: "width 0.2s ease", overflow: "visible" }}>
        <div style={{ padding: collapsed ? "12px 0" : "20px 16px 12px", borderBottom: "1px solid rgba(255,202,0,0.12)", display: "flex", alignItems: "center", justifyContent: collapsed ? "center" : "space-between" }}>
          {collapsed ? (
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
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
              <Link href="/portal" style={{ display: "flex", alignItems: "center", gap: 10, textDecoration: "none" }}>
                <img src="/logo-mark.svg" width={34} height={34} style={{ flexShrink: 0, objectFit: "contain", borderRadius: 6 }} alt="" />
                <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.05 }}>
                  <span style={{ fontFamily: 'Georgia, "Plantagenet Cherokee", serif', fontSize: 17, fontWeight: 700, color: "#FFCA00", letterSpacing: "-0.01em" }}>Omnica</span>
                  <span style={{ fontFamily: 'Georgia, "Plantagenet Cherokee", serif', fontSize: 11, color: "rgba(255,202,0,0.65)", letterSpacing: "0.02em", marginTop: 2 }}>.english</span>
                </div>
              </Link>
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
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

        <nav style={{ padding: collapsed ? "8px 0" : "4px 8px 12px", flex: 1 }}>
          {role === "student" && (
            <>
              <SidebarItem icon="home" label="Home" href="/portal" collapsed={collapsed} />
              <SidebarItem icon="book" label="My Lessons" href="/portal/lessons" collapsed={collapsed} />
              <SidebarItem icon="layers" label="Library" href="/portal/library" collapsed={collapsed} />
              <SidebarItem icon="brain" label="Study" href="/portal/study" badge={m.dueCards} collapsed={collapsed} />
              <SidebarItem icon="bookmark" label="My Words" href="/portal/vocabulary" collapsed={collapsed} />
              <SidebarItem icon="calendar" label="Calendar" href="/portal/calendar" collapsed={collapsed} />
              <SidebarItem icon="trophy" label="Achievements" href="/portal/achievements" collapsed={collapsed} />
              {!collapsed && <div style={{ height: 16 }} />}
              <SidebarItem icon="user" label="Profile" href="/portal/profile" collapsed={collapsed} />
            </>
          )}
          {role === "teacher" && (
            <>
              <SidebarItem icon="home" label="Home" href="/portal" collapsed={collapsed} />
              <SidebarItem icon="video" label="Sessions" href="/portal/sessions" badge={3} collapsed={collapsed} />
              <SidebarItem icon="layers" label="Library" href="/portal/library" collapsed={collapsed} />
              <SidebarItem icon="users" label="Students" href="/portal/students" collapsed={collapsed} />
              <SidebarItem icon="calendar" label="Calendar" href="/portal/calendar" collapsed={collapsed} />
              <SidebarItem icon="chart" label="Reports" href="/portal/reports" collapsed={collapsed} />
            </>
          )}
          {role === "admin" && (
            <>
              <SidebarItem icon="home" label="Dashboard" href="/portal" collapsed={collapsed} />
              <SidebarItem icon="users" label="People" href="/portal/people" collapsed={collapsed} />
              <SidebarItem icon="video" label="Sessions" href="/portal/sessions" collapsed={collapsed} />
              <SidebarItem icon="layers" label="Library" href="/portal/library" collapsed={collapsed} />
              <SidebarItem icon="calendar" label="Calendar" href="/portal/calendar" collapsed={collapsed} />
              <SidebarItem icon="dollar" label="Billing" href="/portal/billing" collapsed={collapsed} />
              <SidebarItem icon="settings" label="Settings" href="/portal/settings" collapsed={collapsed} />
            </>
          )}
        </nav>

        <div style={{ padding: collapsed ? "8px 4px" : "12px 8px", borderTop: "1px solid rgba(255,202,0,0.12)", display: "flex", justifyContent: "center" }}>
          <button style={{
            display: "flex", alignItems: "center", gap: collapsed ? 0 : 10,
            padding: collapsed ? "6px" : "4px 8px 4px 4px",
            borderRadius: collapsed ? 8 : 9999, background: "none", border: "none", cursor: "pointer",
            justifyContent: collapsed ? "center" : undefined,
          }}>
            <span className={`avatar ${collapsed ? "avatar-sm" : ""}`} style={{ background: "rgba(255,202,0,0.2)", color: "#FFCA00" }}>
              {profile.initials}
            </span>
            {!collapsed && (
              <>
                <div style={{ flex: 1, textAlign: "left" as const, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.9)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile.fullName}</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", textTransform: "capitalize" }}>{role}</div>
                </div>
                <Icon name="chevronRight" size={14} stroke="rgba(255,255,255,0.4)" />
              </>
            )}
          </button>
        </div>
      </aside>

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Topbar */}
        <div className="topbar">
          <div style={{ fontSize: 14, color: "var(--omnic-gray-500)" }}>
            <span style={{ color: "var(--omnic-gray-700)", fontWeight: 500, textTransform: "capitalize" }}>{role}</span>
            <span style={{ margin: "0 8px" }}>/</span>
            <span style={{ color: "var(--omnic-gray-900)", fontWeight: 500, textTransform: "capitalize" }}>Dashboard</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span className="pill pill-tenant" style={{ fontSize: 11 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--brand-purple)", display: "inline-block", marginRight: 4 }} />
              omnica-english.omnica.com
            </span>

            {/* Language Switcher */}
            <div ref={langRef} style={{ position: "relative" }}>
              <button onClick={() => setLangOpen(o => !o)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 6, fontSize: 13, fontWeight: 500, color: "var(--omnic-gray-700)", border: "1px solid var(--omnic-gray-200)", background: "white", cursor: "pointer" }}>
                <Icon name="globe" size={14} stroke="var(--omnic-gray-500)" />
                <span style={{ textTransform: "uppercase", fontSize: 11, letterSpacing: "0.04em" }}>{currentLang.code}</span>
                <Icon name="chevronDown" size={12} stroke="var(--omnic-gray-500)" />
              </button>
              {langOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "white", border: "1px solid var(--omnic-gray-200)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.08)", minWidth: 200, zIndex: 100, overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px 6px", fontSize: 11, fontWeight: 600, color: "var(--omnic-gray-500)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--omnic-gray-100)" }}>Interface language</div>
                  {langs.map(l => (
                    <button key={l.code} onClick={() => { setUiLang(l.code); setLangOpen(false) }}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "none", textAlign: "left", cursor: "pointer", background: l.code === uiLang ? "var(--omnic-tenant-primary-soft)" : "white", color: "var(--omnic-gray-900)", fontSize: 13 }}>
                      <span style={{ fontSize: 16 }}>{l.flag}</span>
                      <span style={{ flex: 1 }}>{l.label}</span>
                      {l.code === uiLang && <Icon name="check" size={14} stroke="var(--omnic-tenant-primary)" />}
                    </button>
                  ))}
                  <div style={{ padding: "8px 14px", fontSize: 11, color: "var(--omnic-gray-500)", borderTop: "1px solid var(--omnic-gray-100)", background: "var(--omnic-gray-50)" }}>Stored on User profile</div>
                </div>
              )}
            </div>

            {/* Role Switcher */}
            <div ref={roleRef} style={{ position: "relative" }}>
              <button onClick={() => setRoleOpen(o => !o)}
                style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 6, fontSize: 13, fontWeight: 500, color: "var(--omnic-gray-700)", border: "1px solid var(--omnic-gray-200)", background: "white", cursor: "pointer" }}>
                <Icon name="user" size={14} stroke="var(--omnic-gray-500)" />
                <span style={{ textTransform: "capitalize", fontSize: 13 }}>{role}</span>
                <Icon name="chevronDown" size={12} stroke="var(--omnic-gray-500)" />
              </button>
              {roleOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 6px)", right: 0, background: "white", border: "1px solid var(--omnic-gray-200)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.08)", minWidth: 160, zIndex: 100, overflow: "hidden" }}>
                  <div style={{ padding: "10px 14px 6px", fontSize: 11, fontWeight: 600, color: "var(--omnic-gray-500)", textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: "1px solid var(--omnic-gray-100)" }}>View as</div>
                  {(["student", "teacher", "admin"] as const).map((r) => (
                    <button key={r} onClick={() => { setRole(r); setRoleOpen(false) }}
                      style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", border: "none", textAlign: "left", cursor: "pointer", background: r === role ? "var(--omnic-tenant-primary-soft)" : "white", color: "var(--omnic-gray-900)", fontSize: 13, textTransform: "capitalize" }}>
                      {r === role && <Icon name="check" size={14} stroke="var(--omnic-tenant-primary)" />}
                      <span style={r !== role ? { paddingLeft: 24 } : undefined}>{r}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button style={{ padding: 8, borderRadius: 6, border: "none", background: "none", cursor: "pointer", position: "relative" }}>
              <Icon name="bell" size={18} stroke="var(--omnic-gray-600)" />
              <span style={{ position: "absolute", top: 6, right: 6, width: 7, height: 7, borderRadius: "50%", background: "var(--omnic-red)" }} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, padding: "28px 28px", maxWidth: "100%", background: "var(--app-bg)" }}>
          {children}
        </div>
      </div>

      {role === "student" && <BottomNav />}
    </div>
  )
}

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return <RoleProvider><PortalShell>{children}</PortalShell></RoleProvider>
}
