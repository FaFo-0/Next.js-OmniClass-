"use client";

import { useAuth } from "@/lib/auth";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { NotificationsBell } from "./NotificationsBell";
import { NowClock } from "./NowClock";
import { Menu } from "lucide-react";

export function Topbar({ onOpenNav }: { onOpenNav?: () => void }) {
  const { user, currentPortal } = useAuth();
  const displayName = user?.name?.split(" ")[0] ?? "";
  // No tenant chip: one admin runs one academy, and the sidebar already
  // carries the brand. Bring it back when a user can belong to two tenants.

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

      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <NowClock />
        <LanguageSwitcher />
        <NotificationsBell />
      </div>
    </div>
  );
}
