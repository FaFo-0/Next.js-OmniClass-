import { ThemeSelect } from "@/components/theme/theme-select";
import { SignIn } from "@clerk/nextjs";
import { Logo } from "@/components/layout/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

export default function SignInPage() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-8 bg-background p-4 sm:p-6">
      <div className="flex w-full flex-wrap justify-end gap-3 sm:absolute sm:end-4 sm:top-4 sm:w-auto">
        <ThemeSelect />
        <LanguageSwitcher />
      </div>
      <Logo size="lg" />
      <SignIn
        forceRedirectUrl="/onboarding/post-signup"
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "shadow-lg",
          },
        }}
      />
    </div>
  );
}
