"use client";

import { useAuth } from "@/lib/auth";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { NotificationsBell } from "./NotificationsBell";

export function Topbar() {
  const { user, currentPortal } = useAuth();
  const displayName = user?.name?.split(" ")[0] ?? "";

  return (
    <div className="topbar">
      <div style={{ fontSize: 14, color: "var(--omnic-gray-500)" }}>
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

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="pill pill-tenant" style={{ fontSize: 11 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--brand-purple)", display: "inline-block", marginRight: 4 }} />
          omnica-english
        </span>
        <LanguageSwitcher />
        <NotificationsBell />
      </div>
    </div>
  );
}
