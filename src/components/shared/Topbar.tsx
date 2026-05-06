"use client";

// Shared shell topbar. 56px tall, sits above the main content area.
// Includes mobile menu toggle, brand strip, language switcher,
// notifications bell, OrganizationSwitcher (when user belongs to >1 org),
// and the Clerk UserButton.

import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { LanguageSwitcher } from "@/components/layout/language-switcher";
import { NotificationsBell } from "./NotificationsBell";
import { useMobileSidebar } from "@/components/layout/mobile-sidebar";

export function Topbar() {
  const { user, currentPortal } = useAuth();
  const { toggle } = useMobileSidebar();
  const t = useTranslations("common");

  return (
    <header
      className="sticky top-0 z-30 h-14 flex items-center justify-between px-4 border-b bg-white/85 backdrop-blur"
      style={{ borderColor: "var(--omnic-gray-100)" }}
    >
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={toggle}
          aria-label="Open menu"
        >
          <Menu className="h-5 w-5" />
        </Button>
        <span
          className="hidden sm:inline text-sm font-semibold capitalize"
          style={{ color: "var(--omnic-gray-700)" }}
        >
          {t("portal", { portal: currentPortal ?? "" })}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <NotificationsBell />
        <OrganizationSwitcher
          hidePersonal
          appearance={{
            elements: {
              organizationSwitcherTrigger: "h-9 px-2 rounded-md",
            },
          }}
        />
        <span
          className="hidden md:inline text-sm"
          style={{ color: "var(--omnic-gray-600)" }}
        >
          {user?.name}
        </span>
        <UserButton
          appearance={{ elements: { userButtonAvatarBox: "h-8 w-8" } }}
        />
      </div>
    </header>
  );
}
