"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { NotificationsBell } from "./NotificationsBell";
import { Menu } from "lucide-react";

export function Topbar({ onOpenNav }: { onOpenNav?: () => void }) {
  const { user, currentPortal } = useAuth();
  const displayName = user?.name?.split(" ")[0] ?? "";
  // The org chip is a tenant-context indicator: it only tells you something
  // when you can act across tenants, i.e. admins. For a teacher or student it
  // is noise. (It was also hardcoded, which CLAUDE.md forbids.)
  const tenant = useQuery(api.tenantSettings.getActive, {});
  const showOrgChip = user?.role === "admin";

  return (
    <div className="topbar">
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        {onOpenNav && (
          <button
            type="button"
            className="mobile-nav-btn"
            onClick={onOpenNav}
            aria-label="Open navigation"
          >
            <Menu size={18} />
          </button>
        )}
        <div style={{ fontSize: 14, color: "var(--omnic-gray-500)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <span style={{ color: "var(--omnic-gray-700)", fontWeight: 500, textTransform: "capitalize" }}>
          {currentPortal ?? "dashboard"}
        </span>
        {displayName && (
          <>
            <span style={{ margin: "0 8px" }}>/</span>
            <span style={{ color: "var(--omnic-gray-900)", fontWeight: 500 }}>{displayName}</span>
          </>
        )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {showOrgChip && tenant?.name && (
          <span className="pill pill-tenant" style={{ fontSize: 11 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--brand-purple)", display: "inline-block", marginRight: 4 }} />
            {tenant.name}
          </span>
        )}
        <LanguageSwitcher />
        <NotificationsBell />
      </div>
    </div>
  );
}
