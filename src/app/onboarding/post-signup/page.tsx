"use client";

// H.6 — Post-signup landing. Runs immediately after Clerk redirects
// the newly-signed-up user back to us. If a pending invite cookie is
// present, completes the teacher-invite flow (adds to tenant org as
// teacher, flips role in our DB). Then routes to the matching portal.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export default function PostSignupPage() {
  const router = useRouter();
  const { user, isLoaded } = useAuth();
  const [message, setMessage] = useState("Finishing setup…");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/teacher-invite/accept", {
          method: "POST",
        });
        if (cancelled) return;
        if (res.ok) {
          const j = await res.json();
          if (j.status === "ok") {
            setMessage(`Welcome to ${j.tenantName}.`);
            // Hard reload — Clerk JWT needs the new org membership claim.
            window.location.href = "/teacher/calendar";
            return;
          }
        }
      } catch (e) {
        console.warn("post-signup invite accept failed", e);
      }
      // No invite (or invite failed) — route based on whatever role
      // the user already has, or fall back to org selector.
      if (cancelled) return;
      if (isLoaded && user) {
        router.replace(`/${user.role}`);
      } else if (isLoaded && !user) {
        router.replace("/onboarding/select-org");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, user, router]);

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
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          border: "3px solid var(--omnic-tenant-primary, #6716A4)",
          borderTopColor: "transparent",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <div style={{ fontSize: 14, color: "#52525B" }}>{message}</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
