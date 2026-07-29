import { Logo } from "@/components/layout/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="relative flex h-14 items-center justify-center border-b">
        <Logo />
        <div className="absolute right-4 top-1/2 -translate-y-1/2">
          <LanguageSwitcher />
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
