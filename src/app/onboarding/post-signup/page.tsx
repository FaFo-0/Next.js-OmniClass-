"use client";

// H.6 — Post-signup landing. Runs immediately after Clerk redirects
// the newly-signed-up user back to us. Priority:
//   1. Pending teacher invite → accept it (adds to tenant org as
//      teacher, flips role in our DB) → teacher onboarding.
//   2. No invite (a public student signup) → auto-join the tenant
//      org as a student, then hard-reload so the JWT picks up the
//      org_id claim and normal routing takes over.
//   3. Neither applies → route by whatever role they already have,
//      or fall back to the org selector.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { useAuth } from "@/lib/auth";

export default function PostSignupPage() {
  const router = useRouter();
  const { setActive } = useClerk();
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
          if (j.status === "membership_added") {
            await setActive({ organization: j.organizationId });
            const finalize = await fetch("/api/auth/teacher-invite/accept", {
              method: "POST",
            });
            const finalized = finalize.ok ? await finalize.json() : null;
            if (finalized?.status !== "ok") {
              throw new Error("Teacher invite could not be finalized");
            }
            setMessage(`Welcome to ${finalized.tenantName}.`);
            window.location.href = "/onboarding/teacher";
            return;
          }
          if (j.status === "ok") {
            setMessage(`Welcome to ${j.tenantName}.`);
            // Hard reload — Clerk JWT needs the new org membership claim.
            // Onboarding, not the calendar: an invited teacher has no
            // timezone, no meeting room and no availability yet.
            window.location.href = "/onboarding/teacher";
            return;
          }
        }
      } catch (e) {
        console.warn("post-signup invite accept failed", e);
      }

      // No invite — a public signup. Join the academy's org as a
      // student. The org claim only arrives with a fresh token, so
      // hard-reload rather than client-navigate; the auth provider's
      // onboarding redirect takes it from there.
      try {
        const res = await fetch("/api/auth/auto-join", { method: "POST" });
        if (cancelled) return;
        if (res.ok) {
          const j = await res.json();
          if (j.status === "ok") {
            setMessage(`Welcome to ${j.tenantName}.`);
            await setActive({ organization: j.organizationId });
            window.location.href = "/";
            return;
          }
        }
      } catch (e) {
        console.warn("post-signup auto-join failed", e);
      }

      // Auto-join didn't apply (no tenant / already orgless edge) —
      // route based on whatever role the user already has, or fall
      // back to org selector.
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
  }, [isLoaded, user, router, setActive]);

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
