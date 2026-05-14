"use client";

import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import { useRouter, usePathname } from "next/navigation";
import { useUser, useOrganization } from "@clerk/nextjs";
import { useQuery, useMutation } from "convex/react";
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
  const { organization, isLoaded: orgLoaded } = useOrganization();
  const convexUser = useQuery(api.users.getMe);
  const upsertFromAuth = useMutation(api.users.upsertFromAuth);

  // When a Clerk user is signed in WITH an active org but doesn't have a
  // Convex user yet, upsert them. Gating on `organization` prevents the
  // race where the JWT has not yet picked up the org_id claim — which
  // would surface as "No active organization" from `upsertFromAuth`.
  useEffect(() => {
    if (!clerkLoaded || !orgLoaded) return;
    if (!isSignedIn || !clerkUser) return;
    if (!organization) return; // middleware will redirect to /onboarding/select-org
    if (convexUser === undefined) return;
    if (convexUser === null) {
      upsertFromAuth().catch((err) => {
        console.error("[auth] upsertFromAuth failed:", err);
      });
    }
  }, [
    clerkLoaded,
    orgLoaded,
    isSignedIn,
    clerkUser,
    organization,
    convexUser,
    upsertFromAuth,
  ]);

  const isLoaded = clerkLoaded && convexUser !== undefined;

  // Redirect students with incomplete onboarding to the form. Skip
  // when already on /onboarding/* or /sign-in/* so we don't loop.
  useEffect(() => {
    if (!isLoaded || !convexUser) return;
    if (pathname.startsWith("/onboarding") || pathname.startsWith("/sign-")) {
      return;
    }
    if (
      convexUser.role === "student" &&
      convexUser.onboardingComplete !== true
    ) {
      router.replace("/onboarding/student");
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
