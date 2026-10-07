"use client";

// Post-signup landing. Teacher invites take priority; all other authenticated
// identities are provisioned here after the invite check and routed by stored role.

import { useConvexAuth, useMutation } from "convex/react";
import { useUser } from "@clerk/nextjs";
import { api } from "@convex";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { BrandedLoading } from "@/components/shared/BrandedLoading";

export default function PostSignupPage() {
  const router = useRouter();
  const { user, isLoaded } = useAuth();
  const { isLoaded: clerkLoaded, isSignedIn } = useUser();
  const { isLoading: convexLoading, isAuthenticated } = useConvexAuth();
  const upsertFromAuth = useMutation(api.users.upsertFromAuth);
  const [message, setMessage] = useState("Finishing setup…");
  const [inviteChecked, setInviteChecked] = useState(false);

  const [retry, setRetry] = useState(0);
  const [canRetry, setCanRetry] = useState(false);

  useEffect(() => {
    if (!clerkLoaded || !isSignedIn || convexLoading || !isAuthenticated || inviteChecked) return;
    let cancelled = false;
    (async () => {
      try {
        setCanRetry(false);
        setMessage("Finishing setup…");
        const res = await fetch("/api/auth/teacher-invite/accept", {
          method: "POST",
        });
        if (cancelled) return;
        const result: {
          status: "ok" | "no_invite" | "invalid_invite" | "auth_required" | "retryable_error";
          role?: "student" | "teacher" | "admin";
          onboardingComplete?: boolean;
        } = await res.json();
        if (cancelled) return;
        if ((result.status === "ok" && !result.role) ||
          (result.status !== "invalid_invite" && (!res.ok || (result.status !== "ok" && result.status !== "no_invite")))) {
          throw new Error("Invite acceptance must be retried");
        }
        if (result.status === "ok" && result.role) {
          router.replace(result.role === "admin" || result.onboardingComplete ? `/${result.role}` : `/onboarding/${result.role}`);
          return;
        }
        await upsertFromAuth();
      } catch (error) {
        console.warn("post-signup invite accept failed", error);
        if (!cancelled) {
          setMessage("We could not finish your invitation. Please try again.");
          setCanRetry(true);
        }
        return;
      }
      if (!cancelled) setInviteChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [clerkLoaded, isSignedIn, convexLoading, isAuthenticated, inviteChecked, retry, router, upsertFromAuth]);

  useEffect(() => {
    if (!inviteChecked || !isLoaded || !user) return;
    router.replace(user.role === "admin" || user.onboardingComplete ? `/${user.role}` : `/onboarding/${user.role}`);
  }, [inviteChecked, isLoaded, router, user]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--app-bg, #FFF9E6)",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <BrandedLoading />
      <div style={{ fontSize: 14, color: "#52525B" }}>{message}</div>
      {canRetry && <button type="button" onClick={() => setRetry((value) => value + 1)}>Try again</button>}
    </div>
  );
}
