"use client";

// H.6 — Sign-up wrapper. When ?invite=<token> is present we stash the
// token in a short-lived cookie so the post-signup completion page
// can use it to attach the new user to the right tenant org as a
// teacher. Clerk owns the actual sign-up form.

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { Logo } from "@/components/layout/logo";
import { LanguageSwitcher } from "@/components/layout/language-switcher";

export default function SignUpPage() {
  const params = useSearchParams();
  const invite = params.get("invite");
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    if (!invite) return;
    // 30-minute cookie. Cleared by the consume endpoint after the
    // completion page handles the membership add.
    document.cookie = `omnic_pending_invite=${encodeURIComponent(invite)}; path=/; max-age=1800; samesite=lax`;
    setHint("You have an invite. Finish signing up to join your academy.");
  }, [invite]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6">
      <div className="absolute right-4 top-4">
        <LanguageSwitcher />
      </div>
      <Logo size="lg" />
      {hint && (
        <div
          style={{
            background: "var(--brand-yellow-soft)",
            color: "var(--brand-purple-deep)",
            padding: "8px 16px",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          {hint}
        </div>
      )}
      <SignUp
        forceRedirectUrl="/onboarding/post-signup"
        signInForceRedirectUrl="/onboarding/post-signup"
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
