"use client";

import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";

type Portal = "teacher" | "student" | "admin";

interface AuthState {
  /** The user's externalId in our DB (used as studentId/teacherId in queries). */
  currentUserId: string | null;
  /** The user's role, acting as the "portal" value. */
  currentPortal: Portal | null;
  /** Full user record from Convex. */
  user: {
    externalId: string;
    name: string;
    email: string;
    role: Portal;
    avatarUrl?: string;
    teacherId?: string;
    onboardingComplete?: boolean;
  } | null;
  /** True once Clerk + Convex user data have loaded. */
  isLoaded: boolean;
  /** True if the user is signed in via Clerk. */
  isSignedIn: boolean;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { isLoaded: clerkLoaded, isSignedIn, user: clerkUser } = useUser();
  const convexUser = useQuery(api.users.getMe);
  const upsertFromAuth = useMutation(api.users.upsertFromAuth);

  // Clerk supplies identity only. Create the academy-scoped Convex row once
  // the signed-in user has no existing row.
  useEffect(() => {
    if (!clerkLoaded || !isSignedIn || !clerkUser) return;
    if (convexUser === undefined) return;
    if (convexUser === null) {
      upsertFromAuth().catch((err) => {
        console.error("[auth] upsertFromAuth failed:", err);
      });
    }
  }, [clerkLoaded, isSignedIn, clerkUser, convexUser, upsertFromAuth]);

  const isLoaded = clerkLoaded && convexUser !== undefined;

  // Redirect students with incomplete onboarding to the form. Skip
  // when already on /onboarding/* or /sign-in/* so we don't loop.
  useEffect(() => {
    if (!isLoaded || !convexUser) return;
    if (pathname.startsWith("/onboarding") || pathname.startsWith("/sign-")) {
      return;
    }
    if (convexUser.onboardingComplete === true) return;
    // Teachers need setup too — timezone, meeting room, working hours — and
    // used to land on the calendar with none of it.
    if (convexUser.role === "student" || convexUser.role === "teacher") {
      router.replace(`/onboarding/${convexUser.role}`);
    }
  }, [isLoaded, convexUser, pathname, router]);

  const value: AuthState = {
    currentUserId: convexUser?.externalId ?? null,
    currentPortal: (convexUser?.role as Portal) ?? null,
    user: convexUser
      ? {
          externalId: convexUser.externalId,
          name: convexUser.name,
          email: convexUser.email,
          role: convexUser.role as Portal,
          avatarUrl: convexUser.avatarUrl,
          teacherId: convexUser.teacherId,
          onboardingComplete: convexUser.onboardingComplete,
        }
      : null,
    isLoaded,
    isSignedIn: isSignedIn ?? false,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Drop-in replacement for useMockAuth.
 * Returns { currentUserId, currentPortal } plus extra auth state.
 */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
