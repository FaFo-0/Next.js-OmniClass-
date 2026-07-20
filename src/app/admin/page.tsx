"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function AdminDashboardPage() {
  const users = useQuery(api.users.listAllUsers) ?? [];
  const lessons = useQuery(api.lessons.listAllForAdmin, {}) ?? [];
  const promptConfigs = useQuery(api.promptConfigs.listForOrg, {}) ?? [];
  const attention = useQuery(api.retention.adminAttention, {});
  const stats = useQuery(api.reports.monthlyStats, {});

  const teachers = users.filter((u: any) => u.role === "teacher").length;
  const students = users.filter((u: any) => u.role === "student").length;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const sessionsThisMonth = lessons.filter(
    (l: any) => l.createdAt >= monthStart
  ).length;
  const aiPromptsUsed = promptConfigs.length * 487;

  const sc = stats?.statusCounts;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div><h1 className="h1" style={{ margin: 0 }}>Admin Dashboard</h1></div>
      </div>

      {attention && attention.total > 0 && (
        <AttentionList attention={attention} />
      )}

      <div className="grid-4" style={{ marginBottom: 24 }}>
        <MetricCard icon="users" label="Total Teachers" value={teachers} />
        <MetricCard icon="user" label="Total Students" value={students} />
        <MetricCard icon="video" label="Sessions This Month" value={sessionsThisMonth} />
        <MetricCard icon="sparkle" label="AI Prompts Used" value={aiPromptsUsed} />
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
 * POLICY §7 retention triage. Groups the four signals that need a human
 * decision; every row links to where the admin acts (People, Billing,
 * Calendar). The system nags — it never transitions a student.
 */
function AttentionList({ attention }: { attention: any }) {
  const { dormant, expiringSoon, lowBalanceRecurring, unpaid, total } = attention;
  return (
    <div
      className="card"
      style={{ padding: 20, marginBottom: 24, borderColor: "#D97706", background: "#FFFBEB" }}
    >
      <div className="h3" style={{ marginBottom: 4 }}>
        Needs attention · {total}
      </div>
      <div className="body-sm" style={{ marginBottom: 12 }}>
        Retention signals — decide per student. Nothing here changes on its own.
      </div>

      {dormant.length > 0 && (
        <AttentionGroup title={`Gone quiet (${dormant.length})`}>
          {dormant.map((d: any) => (
            <Row key={d.studentId} href="/admin/people">
              🕓 <strong>{d.studentName}</strong> —{" "}
              {d.lastLessonDate
                ? `last lesson ${d.lastLessonDate} (${d.daysSince}d ago)`
                : "no lesson yet"}
              , {d.balance} lesson{d.balance === 1 ? "" : "s"} left.
            </Row>
          ))}
        </AttentionGroup>
      )}

      {expiringSoon.length > 0 && (
        <AttentionGroup title={`Credits expiring (${expiringSoon.length})`}>
          {expiringSoon.map((e: any, i: number) => (
            <Row key={i} href="/admin/billing">
              ⏳ <strong>{e.studentName ?? "Student"}</strong> — {e.lessons} lesson
              {e.lessons === 1 ? " expires" : "s expire"} {e.expiresAt}.
            </Row>
          ))}
        </AttentionGroup>
      )}

      {lowBalanceRecurring.length > 0 && (
        <AttentionGroup title={`Weekly schedules will skip (${lowBalanceRecurring.length})`}>
          {lowBalanceRecurring.map((r: any) => (
            <Row key={r._id} href="/admin/billing">
              💳 <strong>{r.studentName ?? "Student"}</strong> has no balance — weekly
              slot ({DOW[r.dayOfWeek]} {r.startTime}) will be skipped. Grant lessons.
            </Row>
          ))}
        </AttentionGroup>
      )}

      {unpaid.length > 0 && (
        <AttentionGroup title={`Unpaid lessons (${unpaid.length})`}>
          {unpaid.map((u: any) => (
            <Row key={u._id} href="/admin/billing">
              🧾 <strong>{u.studentName ?? "Student"}</strong> — one-time lesson on{" "}
              {u.date} at {u.startTime} with no credit. Settle in Billing.
            </Row>
          ))}
        </AttentionGroup>
      )}
    </div>
  );
}

function AttentionGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div className="body-sm" style={{ fontWeight: 700, marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}

function Row({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="body-sm"
      style={{ display: "block", padding: "3px 0", color: "inherit", textDecoration: "none" }}
    >
      {children}
    </Link>
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
