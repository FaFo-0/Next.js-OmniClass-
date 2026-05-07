"use client";

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { useAuth } from "@/lib/auth";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { NotificationsBell } from "./NotificationsBell";

export function Topbar() {
  const { user, currentPortal } = useAuth();

  return (
    <div className="topbar">
      <div style={{ fontSize: 14, color: "var(--omnic-gray-500)" }}>
        <span style={{ color: "var(--omnic-gray-700)", fontWeight: 500, textTransform: "capitalize" }}>
          {currentPortal ?? "dashboard"}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span className="pill pill-tenant" style={{ fontSize: 11 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--brand-purple)", display: "inline-block", marginRight: 4 }} />
          omnica-english
        </span>

        <LanguageSwitcher />
        <NotificationsBell />
        <OrganizationSwitcher
          hidePersonal
          appearance={{ elements: { organizationSwitcherTrigger: "h-9 px-2 rounded-md text-sm" } }}
        />
        <UserButton appearance={{ elements: { userButtonAvatarBox: "h-8 w-8" } }} />
      </div>
    </div>
  );
}
