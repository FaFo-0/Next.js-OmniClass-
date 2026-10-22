"use client";

import { ThemeSelect } from "@/components/theme/theme-select";

import { useAuth } from "@/lib/auth";
import { useTranslations } from "next-intl";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { Logo } from "@/components/layout/logo";
import { NotificationsBell } from "./NotificationsBell";
import { Menu } from "lucide-react";

export function Topbar({ onOpenNav }: { onOpenNav?: () => void }) {
  const { user, currentPortal } = useAuth();
  const t = useTranslations("app.portal");
  const common = useTranslations("common");
  const portalLabel = (() => {
    const key = currentPortal ?? "dashboard";
    const value = t(key);
    return value.endsWith(`.${key}`) ? key : value;
  })();
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
            aria-label={common("openNavigation")}
          >
            <Menu size={18} />
          </button>
        )}
        <span className="max-w-24 shrink overflow-hidden sm:max-w-40 md:hidden"><Logo size="sm" /></span>
        <div className="hidden sm:block" style={{ fontSize: 14, color: "var(--omnic-gray-500)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <span style={{ color: "var(--omnic-gray-700)", fontWeight: 500, textTransform: "capitalize" }}>
          {portalLabel}
        </span>
        {displayName && (
          <>
            <span style={{ margin: "0 8px" }}>/</span>
            <span style={{ color: "var(--omnic-gray-900)", fontWeight: 500 }}>{displayName}</span>
          </>
        )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-3">
        {/* No clock here: your own time is already on your screen. Time is
            shown where it isn't obvious — next to other people's names. */}
        <ThemeSelect />
        <LanguageSwitcher />
        <NotificationsBell />
      </div>
    </div>
  );
}
