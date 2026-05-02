"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { Loader2 } from "lucide-react";

type Role = "teacher" | "student" | "admin";

/**
 * Gates a portal by role. Admin always has access (they can impersonate any portal).
 * A user of any other role landing on a portal they don't own is silently
 * redirected to their own portal — never dumped onto an error page.
 *
 * Keep this above any Convex query that is role-gated (listUsers, etc.) so the
 * query never fires for the wrong role.
 */
export function RoleGuard({
  allow,
  children,
}: {
  allow: Role[];
  children: ReactNode;
}) {
  const router = useRouter();
  const { user, isLoaded, isSignedIn } = useAuth();

  const allowed =
    !!user && (user.role === "admin" || allow.includes(user.role));

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) return; // middleware handles sign-in
    if (!user) return; // upsertFromAuth still pending
    if (allowed) return;

    // Wrong portal — send them home, which redirects to their own portal
    const destination =
      user.role === "admin"
        ? "/admin"
        : user.role === "teacher"
          ? "/teacher"
          : "/student";
    router.replace(destination);
  }, [isLoaded, isSignedIn, user, allowed, router]);

  if (!isLoaded || !user || !allowed) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <>{children}</>;
}
