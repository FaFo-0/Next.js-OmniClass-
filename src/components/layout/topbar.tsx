"use client";

import { useClerk } from "@clerk/nextjs";
import { useAuth } from "@/lib/auth";
import { useTranslations } from "next-intl";
import { LogOut, Menu } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Logo } from "./logo";
import { LanguageSwitcher } from "./language-switcher";
import { useMobileSidebar } from "./mobile-sidebar";

export function Topbar() {
  const { user, currentPortal } = useAuth();
  const { signOut } = useClerk();
  const { toggle } = useMobileSidebar();
  const t = useTranslations("common");
  const tNav = useTranslations("nav");

  const initials = user?.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b bg-card/80 px-4 backdrop-blur-sm">
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden"
          onClick={toggle}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <Logo size="sm" showText={false} />
        <div className="hidden h-5 w-px bg-border sm:block" />
        <span className="hidden text-sm font-semibold capitalize sm:inline">
          {t("portal", { portal: currentPortal ?? "" })}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <LanguageSwitcher />
        <span className="hidden text-sm text-muted-foreground sm:inline">{user?.name}</span>
        <Avatar className="h-8 w-8">
          {user?.avatarUrl && <AvatarImage src={user.avatarUrl} />}
          <AvatarFallback className="bg-primary/10 text-primary text-xs font-bold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => signOut({ redirectUrl: "/sign-in" })}
          title={tNav("signOut")}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
