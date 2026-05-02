"use client";

import {
  createContext,
  useContext,
  useEffect,
  type ReactNode,
} from "react";
import { useUser } from "@clerk/nextjs";
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
  const { isLoaded: clerkLoaded, isSignedIn, user: clerkUser } = useUser();
  const convexUser = useQuery(api.users.getMe);
  const upsertFromAuth = useMutation(api.users.upsertFromAuth);

  // When a Clerk user is signed in but doesn't have a Convex user yet, upsert them
  useEffect(() => {
    if (!clerkLoaded || !isSignedIn || !clerkUser) return;
    // convexUser is undefined while loading, null if not found after load
    if (convexUser === undefined) return; // still loading
    if (convexUser === null) {
      // User signed in via Clerk but not in our DB yet — create them
      upsertFromAuth();
    }
  }, [clerkLoaded, isSignedIn, clerkUser, convexUser, upsertFromAuth]);

  const isLoaded = clerkLoaded && convexUser !== undefined;

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
