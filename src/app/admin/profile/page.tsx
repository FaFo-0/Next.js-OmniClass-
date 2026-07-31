"use client";

import Link from "next/link";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { AccountCard } from "@/components/shared/AccountCard";
import { Icon } from "@/components/shared/icons";

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
      <div className="body-sm" style={{ marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Row({ label, value, last = false }: { label: string; value: string; last?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "9px 0",
        borderBottom: last ? "none" : "1px solid var(--omnic-gray-100)",
      }}
    >
      <span className="body-sm">{label}</span>
      <strong style={{ fontSize: 13 }}>{value}</strong>
    </div>
  );
}

export default function AdminProfilePage() {
  const me = useQuery(api.users.getMe);
  const tenant = useQuery(api.tenantSettings.getActive, {});
  const users = useQuery(api.users.listUsers, {}) ?? [];
  const stats = useQuery(api.reports.monthlyStats, {});
  const teachers = users.filter((user: any) => user.role === "teacher").length;
  const students = users.filter((user: any) => user.role === "student").length;

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <div style={{ maxWidth: 560 }}>
        <AccountCard />
      </div>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <Metric label="Teachers" value={teachers} />
        <Metric label="Students" value={students} />
        <Metric label="Lessons delivered this month" value={stats?.lessonsDelivered ?? 0} />
      </div>

      <div className="split-2-1">
        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 8 }}>Your academy</div>
          <p className="body-sm" style={{ marginBottom: 16 }}>
            {tenant?.name ?? "Your academy"} · {tenant?.timezone ?? "Academy timezone not set"}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 8 }}>
            <Link href="/admin/people" className="btn btn-secondary">
              <Icon name="users" size={15} /> Manage people
            </Link>
            <Link href="/admin/calendar" className="btn btn-secondary">
              <Icon name="calendar" size={15} /> Open calendar
            </Link>
            <Link href="/admin/billing" className="btn btn-secondary">
              <Icon name="dollar" size={15} /> Billing records
            </Link>
            <Link href="/admin/settings" className="btn btn-secondary">
              <Icon name="settings" size={15} /> Academy settings
            </Link>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 12 }}>Your access</div>
          <Row label="Role" value="Admin" />
          <Row label="Academy" value={tenant?.name ?? "—"} />
          <Row label="Academy timezone" value={tenant?.timezone ?? "Not set"} />
          <Row
            label="Member since"
            value={me?.createdAt ? new Date(me.createdAt).toLocaleDateString() : "—"}
            last
          />
          <div className="body-sm" style={{ marginTop: 12, color: "var(--omnic-gray-500)" }}>
            The card above holds your own timezone and clock. Academy-wide
            branding, policies and prompts live in Settings.
          </div>
        </div>
      </div>
    </div>
  );
}
