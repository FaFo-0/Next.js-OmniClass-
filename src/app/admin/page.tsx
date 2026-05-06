"use client";

import { useQuery } from "convex/react";
import { api } from "@convex";
import { useBrand } from "@/lib/brand/provider";
import { useAuth } from "@/lib/auth";

// Phase A landing stub. Real admin dashboard is built in Phase F.
// Confirms tenant resolution + brand colors are live.
export default function AdminLandingStub() {
  const { user } = useAuth();
  const { tenantBrand, primaryColor, backgroundColor } = useBrand();
  const settings = useQuery(api.tenantSettings.getActive);

  return (
    <div className="p-8 space-y-6">
      <div
        className="rounded-2xl p-6 border"
        style={{ background: backgroundColor, borderColor: primaryColor }}
      >
        <h1
          className="text-3xl font-bold"
          style={{ color: primaryColor }}
        >
          {tenantBrand.name}
        </h1>
        <p className="mt-2 text-sm" style={{ color: primaryColor }}>
          {tenantBrand.tagline}
        </p>
      </div>

      <div className="rounded-xl border bg-white p-6 space-y-3">
        <h2 className="text-lg font-semibold">Phase A complete</h2>
        <p className="text-sm text-zinc-600">
          Multi-tenancy bedrock landed. Tenant settings resolved from Convex,
          brand colors applied at runtime, organization isolation enforced on
          every query.
        </p>
        <ul className="text-sm text-zinc-700 space-y-1 list-disc ms-5">
          <li>
            Active org: <code>{settings?.organizationId ?? "loading…"}</code>
          </li>
          <li>
            Signed in as: <code>{user?.email}</code> ({user?.role})
          </li>
          <li>
            Primary color: <code>{primaryColor}</code>
          </li>
          <li>
            Background: <code>{backgroundColor}</code>
          </li>
        </ul>
        <p className="text-sm text-zinc-500 pt-2 border-t">
          Feature pages (people, sessions, AI manager, scheduling, branding,
          billing, library) ship in Phases B–G. Sidebar links may currently
          throw — they reference deleted Convex modules and will be rebuilt
          phase by phase per <code>MASTER_PLAN.md</code>.
        </p>
      </div>
    </div>
  );
}
