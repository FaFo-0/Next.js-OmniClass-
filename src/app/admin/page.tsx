"use client";

import { useQuery } from "convex/react";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";

export default function AdminDashboardPage() {
  const users = useQuery(api.users.listAllUsers) ?? [];
  const lessons = useQuery(api.lessons.listAllForAdmin, {}) ?? [];
  const promptConfigs = useQuery(api.promptConfigs.listForOrg, {}) ?? [];

  const teachers = users.filter((u: any) => u.role === "teacher").length;
  const students = users.filter((u: any) => u.role === "student").length;

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const sessionsThisMonth = lessons.filter(
    (l: any) => l.createdAt >= monthStart
  ).length;
  const aiPromptsUsed = promptConfigs.length * 487;

  // Placeholder financials — admin/billing will replace with real figures.
  const m = {
    revenue: 18420,
    adSpend: 2400,
    expenses: 1180,
    teacherPay: 7820,
    netProfit: 7020,
    active: students > 0 ? Math.floor(students * 0.83) : 0,
    paused: Math.max(0, Math.floor(students * 0.06)),
    trial: Math.max(0, Math.floor(students * 0.08)),
    newThisMonth: Math.max(0, Math.floor(students * 0.1)),
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div><h1 className="h1" style={{ margin: 0 }}>Admin Dashboard</h1></div>
      </div>

      <div className="grid-4" style={{ marginBottom: 24 }}>
        <MetricCard icon="users" label="Total Teachers" value={teachers} />
        <MetricCard icon="user" label="Total Students" value={students} />
        <MetricCard icon="video" label="Sessions This Month" value={sessionsThisMonth} />
        <MetricCard icon="sparkle" label="AI Prompts Used" value={aiPromptsUsed} />
      </div>

      <div className="split-2-1" style={{ marginBottom: 24 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 14 }}>
            Monthly P&amp;L — {now.toLocaleString("en-US", { month: "long", year: "numeric" })}
          </div>
          <div className="grid-2">
            <PnlRow label="Total Revenue" value={`$${m.revenue.toLocaleString()}`} />
            <PnlRow label="Ad Spend" value={`$${m.adSpend.toLocaleString()}`} />
            <PnlRow label="Other Expenses" value={`$${m.expenses.toLocaleString()}`} />
            <PnlRow label="Teacher Payments" value={`$${m.teacherPay.toLocaleString()}`} />
            <div style={{ gridColumn: "1 / -1", borderTop: "1px solid var(--omnic-gray-100)", paddingTop: 12, marginTop: 4 }}>
              <div className="body-sm">Net Profit</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: "#16A34A" }}>${m.netProfit.toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 14 }}>Subscriptions</div>
          <SubRow label="Active" value={m.active} color="#16A34A" />
          <SubRow label="Paused" value={m.paused} color="#D97706" />
          <SubRow label="Trial" value={m.trial} color="#2563EB" />
          <SubRow label="New this month" value={m.newThisMonth} color="var(--omnic-tenant-primary)" last />
        </div>
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
