"use client";

import { useEffect, useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { OrganizationList } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";

// User lands here when signed in with no active org. For this
// single-tenant deployment that is almost always a stranded signup
// (they signed up before auto-join existed, or an invite went bad):
// Clerk's <OrganizationList /> can only list orgs they already belong
// to, which for them is nothing — a dead end. So first try to
// auto-join the tenant this deployment serves; only fall back to the
// raw list if that fails.
export default function SelectOrgPage() {
  const { isSignedIn, isLoaded } = useUser();
  const { setActive } = useClerk();
  // null = still deciding, true = auto-join failed → show the list.
  const [showFallback, setShowFallback] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;
    (async () => {
      // Signed-out: middleware sends them to sign-in anyway; just show
      // the list so this page never hangs on a spinner.
      if (!isSignedIn) {
        if (!cancelled) setShowFallback(true);
        return;
      }
      try {
        const res = await fetch("/api/auth/auto-join", { method: "POST" });
        if (cancelled) return;
        if (res.ok) {
          const j = await res.json();
          // Joined (or already a member) — hard reload so the session
          // token picks up the org_id claim and routing takes over.
          if (j.status === "ok") {
            await setActive({ organization: j.organizationId });
            window.location.href = "/";
            return;
          }
        }
      } catch (e) {
        console.warn("select-org auto-join failed", e);
      }
      if (!cancelled) setShowFallback(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, setActive]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#FFCA00] p-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold mb-6 text-center text-[#6716A4]">
          Select your school
        </h1>
        {!showFallback ? (
          <div className="flex items-center justify-center gap-2 text-[#6716A4]">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm font-medium">Joining your academy…</span>
          </div>
        ) : (
          <OrganizationList
            hidePersonal
            afterSelectOrganizationUrl="/"
            afterCreateOrganizationUrl="/"
          />
        )}
      </div>
    </div>
  );
}
