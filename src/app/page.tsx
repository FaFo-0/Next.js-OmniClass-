"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/layout/logo";

/**
 * Root page — redirects authenticated users to their portal based on role.
 * Clerk middleware handles unauthenticated users (redirects to /sign-in).
 */
export default function RootRedirect() {
  const router = useRouter();
  const { currentPortal, isLoaded, isSignedIn } = useAuth();
  const t = useTranslations("auth");

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) return; // middleware handles this
    // Wait until we have the actual role from Convex before redirecting
    if (!currentPortal) return;

    if (currentPortal === "admin") {
      router.replace("/admin");
    } else if (currentPortal === "teacher") {
      router.replace("/teacher");
    } else {
      router.replace("/student");
    }
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
