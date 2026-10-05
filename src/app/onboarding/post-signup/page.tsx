"use client";

// Post-signup landing. Teacher invites take priority; all other authenticated
// identities are provisioned by AuthProvider and routed by their Convex role.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { BrandedLoading } from "@/components/shared/BrandedLoading";

export default function PostSignupPage() {
  const router = useRouter();
  const { user, isLoaded } = useAuth();
  const [message, setMessage] = useState("Finishing setup…");
  const [inviteChecked, setInviteChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/teacher-invite/accept", {
          method: "POST",
        });
        if (cancelled) return;
        if (!res.ok) {
          setMessage("This teacher invitation is invalid or expired.");
          return;
        }
        const result = await res.json();
        if (result.status === "ok") {
          router.replace("/onboarding/teacher");
          return;
        }
      } catch (error) {
        console.warn("post-signup invite accept failed", error);
        if (!cancelled) {
          setMessage("We could not finish your invitation. Please try again.");
        }
        return;
      }
      if (!cancelled) setInviteChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!inviteChecked || !isLoaded || !user) return;
    router.replace(user.role === "student" ? "/onboarding/student" : `/${user.role}`);
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
    </div>
  );
}
