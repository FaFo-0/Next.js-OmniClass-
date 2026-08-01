"use client";

import Link from "next/link";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function AdminDashboardPage() {
  const users = useQuery(api.users.listAllUsers) ?? [];
  const lessons = useQuery(api.lessons.listAllForAdmin, {}) ?? [];
  const pendingReschedules = useQuery(api.schedule.listPendingReschedules, {}) ?? [];
  const attention = useQuery(api.retention.adminAttention, {});
  const stats = useQuery(api.reports.monthlyStats, {});

  const teachers = users.filter((u: any) => u.role === "teacher").length;
  const students = users.filter((u: any) => u.role === "student").length;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const sessionsThisMonth = lessons.filter(
    (l: any) => l.createdAt >= monthStart
  ).length;

  const sc = stats?.statusCounts;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div><h1 className="h1" style={{ margin: 0 }}>Admin Dashboard</h1></div>
      </div>

      {attention && attention.total > 0 && <AttentionSummary attention={attention} />}

      <div className="grid-4" style={{ marginBottom: 24 }}>
        <MetricCard icon="users" label="Total Teachers" value={teachers} />
        <MetricCard icon="user" label="Total Students" value={students} />
        <MetricCard icon="video" label="Sessions This Month" value={sessionsThisMonth} />
        <Link href="/admin/scheduling/requests" style={{ textDecoration: "none" }}>
          <MetricCard
            icon="calendar"
            label="Pending Reschedules"
            value={pendingReschedules.length}
          />
        </Link>
      </div>

      <div className="split-2-1" style={{ marginBottom: 24 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 14 }}>
            This month — {now.toLocaleString("en-US", { month: "long", year: "numeric" })}
          </div>
          {/* Real ledger numbers only. Revenue = pack-linked grants; manual
              no-pack grants carry no price and are shown as a count, never
              guessed at. Payouts appear when the payout report ships. */}
          <div className="grid-2">
            <PnlRow
              label="Revenue (pack sales)"
              value={stats ? `$${stats.revenueUSD.toLocaleString()}` : "…"}
            />
            <PnlRow
              label="Lessons sold"
              value={stats ? String(stats.lessonsSold) : "…"}
            />
            <PnlRow
              label="Lessons delivered"
              value={stats ? String(stats.lessonsDelivered) : "…"}
            />
            <PnlRow
              label="Lessons used (ledger)"
              value={stats ? String(stats.lessonsSpent) : "…"}
            />
            {stats && stats.manualLessons > 0 && (
              <div style={{ gridColumn: "1 / -1" }} className="body-sm">
                + {stats.manualLessons} lesson{stats.manualLessons === 1 ? "" : "s"} granted
                manually without a pack (no price recorded)
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 14 }}>Students</div>
          <SubRow label="Active" value={sc?.active ?? 0} color="#16A34A" />
          <SubRow label="Trial" value={sc?.trial ?? 0} color="#2563EB" />
          <SubRow label="Paused" value={sc?.paused ?? 0} color="#D97706" />
          <SubRow label="New this month" value={stats?.newThisMonth ?? 0} color="var(--omnic-tenant-primary)" last />
        </div>
      </div>
    </div>
  );
}

/**
 * POLICY §7 triage, summarised. The full list lives on /admin/attention —
 * on the dashboard it would grow without limit and bury everything else.
 * Counts only, each one a link into the section it belongs to.
 */
function AttentionSummary({ attention }: { attention: any }) {
  const groups = [
    { key: "dormant", label: "Gone quiet", count: attention.dormant.length },
    { key: "neverBooked", label: "Never booked", count: attention.neverBooked.length },
    { key: "expiring", label: "Credits expiring", count: attention.expiringSoon.length },
    { key: "lowBalance", label: "Schedules will skip", count: attention.lowBalanceRecurring.length },
    { key: "unpaid", label: "Unpaid lessons", count: attention.unpaid.length },
  ].filter((g) => g.count > 0);

  return (
    <div
      className="card"
      style={{ padding: 18, marginBottom: 24, borderColor: "#D97706", background: "#FFFBEB" }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div className="h3" style={{ marginBottom: 2 }}>Needs attention · {attention.total}</div>
          <div className="body-sm">Nothing here changes on its own — each row is a decision.</div>
        </div>
        <Link href="/admin/attention" className="btn btn-secondary btn-sm">
          Open list <Icon name="chevronRight" size={14} />
        </Link>
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
        {groups.map((g) => (
          <Link
            key={g.key}
            href={`/admin/attention#${g.key}`}
            className="chip"
            style={{ textDecoration: "none", color: "inherit" }}
          >
            {g.label} <strong style={{ marginInlineStart: 4 }}>{g.count}</strong>
          </Link>
        ))}
      </div>
    </div>
  );
}

function MetricCard({ icon, label, value }: { icon: string; label: string; value: number | string }) {
  return (
    <div className="card" style={{ padding: "var(--pad-card)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{
          width: 36, height: 36, borderRadius: 8,
          background: "var(--omnic-tenant-primary-soft)",
          color: "var(--omnic-tenant-primary)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Icon name={icon} size={18} />
        </div>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 14, color: "var(--omnic-gray-900)", letterSpacing: "-0.02em" }}>{value}</div>
      <div className="body-sm" style={{ marginTop: 2 }}>{label}</div>
    </div>
  );
}

function PnlRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="body-sm">{label}</div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "var(--omnic-gray-900)" }}>{value}</div>
    </div>
  );
}

function SubRow({ label, value, color, last }: { label: string; value: number; color: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: last ? "none" : "1px solid var(--omnic-gray-100)" }}>
      <span className="body-sm">{label}</span>
      <span style={{ fontSize: 18, fontWeight: 700, color }}>{value}</span>
    </div>
  );
}
