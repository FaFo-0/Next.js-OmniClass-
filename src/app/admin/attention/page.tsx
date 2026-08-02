"use client";

// POLICY §7 triage list. Lives on its own page rather than the dashboard:
// the signals accumulate, and most of them are "decide this week", not
// "decide now". Every row links to where the admin acts and can be
// dismissed for a month when it's been handled.

import Link from "next/link";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { toast } from "sonner";
import { Icon } from "@/components/shared/icons";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const SIGNAL_LABELS: Record<string, string> = {
  dormant: "Gone quiet",
  neverBooked: "Never booked",
  expiring: "Credits expiring",
  lowBalance: "Schedule will skip",
  unpaid: "Unpaid lesson",
};

export default function AdminAttentionPage() {
  const attention = useQuery(api.retention.adminAttention, {});
  const financeDue = useQuery(api.finance.dueReminders, {}) ?? [];
  const dismissed = useQuery(api.retention.listDismissed, {}) ?? [];
  const dismiss = useMutation(api.retention.dismissAttention);
  const restore = useMutation(api.retention.restoreAttention);

  async function handleDismiss(signal: string, subjectId: string) {
    try {
      await dismiss({ signal, subjectId });
      toast.success("Hidden for 30 days");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  if (attention === undefined) {
    return <div className="body">Loading…</div>;
  }

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ marginBottom: 20 }}>
        <Link href="/admin" className="link body-sm">
          <Icon name="chevronLeft" size={12} /> Dashboard
        </Link>
        <h1 className="h1" style={{ margin: "8px 0 4px" }}>Needs attention</h1>
        <p className="body-sm">
          Retention signals, recomputed live. Nothing here changes a student on
          its own — dismissing a row just hides it for a month.
        </p>
      </div>

      {financeDue.length > 0 && (
        <div className="card" id="money" style={{ padding: 20, marginBottom: 16, scrollMarginTop: 90 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
            <div className="h3" style={{ margin: 0 }}>Money to record</div>
            <span className="pill pill-new" style={{ fontSize: 11 }}>{financeDue.length}</span>
          </div>
          <p className="body-sm" style={{ margin: "4px 0 12px" }}>
            Costs the system can&apos;t see by itself. Nothing is guessed — enter what you actually paid.
          </p>
          {financeDue.map((d: any) => (
            <div
              key={d._id}
              style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--omnic-gray-100)", flexWrap: "wrap" }}
            >
              <span className="body-sm">
                <strong>{d.label}</strong> — {d.period}
                {d.expectedAmount ? ` · usually ${d.expectedAmount} ${d.currency}` : ""}
              </span>
              <Link href="/admin/billing" className="btn btn-secondary btn-sm">Record it</Link>
            </div>
          ))}
        </div>
      )}

      {attention.total === 0 && financeDue.length === 0 && (
        <div className="card" style={{ padding: 28, textAlign: "center" }}>
          <div className="body">Nothing needs attention right now.</div>
        </div>
      )}

      <Section
        id="unpaid"
        title="Unpaid lessons"
        note="A one-time lesson ran against an empty balance. Settle it in Billing."
        rows={attention.unpaid}
        empty={attention.unpaid.length === 0}
      >
        {attention.unpaid.map((u: any) => (
          <RowItem
            key={u._id}
            href="/admin/billing"
            action="Settle in Billing"
            onDismiss={() => handleDismiss("unpaid", u._id)}
          >
            <strong>{u.studentName ?? "Student"}</strong> — {u.date} at {u.startTime}
          </RowItem>
        ))}
      </Section>

      <Section
        id="lowBalance"
        title="Weekly schedules will skip"
        note="The recurring cron won't materialise these lessons while the balance is zero."
        rows={attention.lowBalanceRecurring}
        empty={attention.lowBalanceRecurring.length === 0}
      >
        {attention.lowBalanceRecurring.map((r: any) => (
          <RowItem
            key={r._id}
            href="/admin/billing"
            action="Grant lessons"
            onDismiss={() => handleDismiss("lowBalance", r.studentId)}
          >
            <strong>{r.studentName ?? "Student"}</strong> — no balance, weekly slot{" "}
            {DOW[r.dayOfWeek]} {r.startTime}
          </RowItem>
        ))}
      </Section>

      <Section
        id="expiring"
        title="Credits expiring"
        note="Lessons lapse 60 days after first use (POLICY §2)."
        rows={attention.expiringSoon}
        empty={attention.expiringSoon.length === 0}
      >
        {attention.expiringSoon.map((e: any, i: number) => (
          <RowItem
            key={`${e.studentId}-${i}`}
            href={`/admin/students/${e.studentId}`}
            action="Open student"
            onDismiss={() => handleDismiss("expiring", e.studentId)}
          >
            <strong>{e.studentName ?? "Student"}</strong> — {e.lessons} lesson
            {e.lessons === 1 ? "" : "s"} expire {e.expiresAt}
          </RowItem>
        ))}
      </Section>

      <Section
        id="dormant"
        title="Gone quiet"
        note="Had lessons, still holds credit, nothing in the last two weeks."
        rows={attention.dormant}
        empty={attention.dormant.length === 0}
      >
        {attention.dormant.map((d: any) => (
          <RowItem
            key={d.studentId}
            href={`/admin/students/${d.studentId}`}
            action="Open student"
            onDismiss={() => handleDismiss("dormant", d.studentId)}
          >
            <strong>{d.studentName}</strong> — last lesson {d.lastLessonDate} (
            {d.daysSince}d ago), {d.balance} left
          </RowItem>
        ))}
      </Section>

      <Section
        id="neverBooked"
        title="Never booked"
        note="Signed up over a week ago, holds credit (usually the trial) and has nothing on the calendar."
        rows={attention.neverBooked}
        empty={attention.neverBooked.length === 0}
      >
        {attention.neverBooked.map((n: any) => (
          <RowItem
            key={n.studentId}
            href={`/admin/students/${n.studentId}`}
            action="Open student"
            onDismiss={() => handleDismiss("neverBooked", n.studentId)}
          >
            <strong>{n.studentName}</strong> — joined {n.daysSinceSignup}d ago,{" "}
            {n.balance} lesson{n.balance === 1 ? "" : "s"} unused
          </RowItem>
        ))}
      </Section>

      {dismissed.length > 0 && (
        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 4 }}>Dismissed</div>
          <p className="body-sm" style={{ marginBottom: 12 }}>
            Hidden until the date shown. Bring one back if you dismissed it by
            mistake.
          </p>
          {dismissed.map((d: any) => (
            <div
              key={d._id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: "8px 0",
                borderBottom: "1px solid var(--omnic-gray-100)",
              }}
            >
              <span className="body-sm">
                {SIGNAL_LABELS[d.signal] ?? d.signal} · hidden until {d.until}
              </span>
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  try {
                    await restore({ id: d._id });
                    toast.success("Back on the list");
                  } catch (e) {
                    toast.error((e as Error).message);
                  }
                }}
              >
                <Icon name="refresh" size={12} /> Restore
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Section({
  id,
  title,
  note,
  rows,
  empty,
  children,
}: {
  id: string;
  title: string;
  note: string;
  rows: any[];
  empty: boolean;
  children: React.ReactNode;
}) {
  if (empty) return null;
  return (
    <div className="card" id={id} style={{ padding: 20, marginBottom: 16, scrollMarginTop: 90 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <div className="h3" style={{ margin: 0 }}>{title}</div>
        <span className="pill pill-new" style={{ fontSize: 11 }}>{rows.length}</span>
      </div>
      <p className="body-sm" style={{ margin: "4px 0 12px" }}>{note}</p>
      <div style={{ display: "flex", flexDirection: "column" }}>{children}</div>
    </div>
  );
}

function RowItem({
  href,
  action,
  onDismiss,
  children,
}: {
  href: string;
  action: string;
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid var(--omnic-gray-100)",
        flexWrap: "wrap",
      }}
    >
      <span className="body-sm">{children}</span>
      <span style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <Link href={href} className="btn btn-secondary btn-sm">{action}</Link>
        <button className="btn btn-ghost btn-sm" onClick={onDismiss} title="Hide for 30 days">
          <Icon name="x" size={12} /> Dismiss
        </button>
      </span>
    </div>
  );
}
