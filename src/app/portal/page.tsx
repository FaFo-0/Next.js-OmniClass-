"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/layout/logo";

/** Signed-in role router. Public visitors enter through the landing page at /. */
export default function PortalRedirect() {
  const router = useRouter();
  const { currentPortal, isLoaded, isSignedIn } = useAuth();
  const t = useTranslations("auth");

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      router.replace("/sign-in");
      return;
    }
    if (!currentPortal) return;
    router.replace(currentPortal === "admin" ? "/admin" : currentPortal === "teacher" ? "/teacher" : "/student");
  }, [isLoaded, isSignedIn, currentPortal, router]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background">
      <Logo size="lg" />
      <div className="mt-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm">{t("loadingPortal")}</span>
      </div>
    </div>
  );
}
