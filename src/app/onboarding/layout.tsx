"use client";

import { useClerk } from "@clerk/nextjs";
import { useTranslations } from "next-intl";
import { Logo } from "@/components/layout/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { signOut } = useClerk();
  const t = useTranslations("nav");

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-b px-4 py-2">
        <Logo />
        <div className="ms-auto flex flex-wrap items-center justify-end gap-2">
          <LanguageSwitcher />
          <button
            type="button"
            onClick={() => signOut({ redirectUrl: "/sign-in" })}
            className="min-h-11 rounded-md px-3 py-2 text-sm font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {t("signOut")}
          </button>
        </div>
      </header>
      {/* Wizards are tall — top-align so a long step doesn't get cropped on
          short screens, and keep breathing room around the card. */}
      <main
        className="flex flex-1 flex-col items-center p-4"
        style={{ paddingTop: 32, paddingBottom: 48, overflowY: "auto" }}
      >
        {children}
      </main>
    </div>
  );
}
