"use client";

// The money side of Billing: what came in, what went out, who still has to be
// paid. Three tabs' worth of UI kept out of the (already long) billing page.

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { toast } from "sonner";
import { Icon } from "@/components/shared/icons";

const CATEGORY_LABELS: Record<string, string> = {
  pack_sale: "Lesson packs",
  refund: "Refunds",
  salary: "Teacher salaries",
  ads: "Advertising",
  subscriptions: "Subscriptions",
  tools: "Tools & software",
  rent: "Rent",
  other: "Other",
};

const MANUAL_CATEGORIES = ["salary", "ads", "subscriptions", "tools", "rent", "other"] as const;

function money(amount: number, currency: string) {
  return `${amount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
}

function monthLabel(month: string) {
  return new Date(`${month}-01T12:00:00`).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

// ── Overview ─────────────────────────────────────────────────────────

export function FinanceOverview() {
  const [month, setMonth] = useState<string | undefined>(undefined);
  const summary = useQuery(api.finance.monthSummary, { month });
  const payroll = useQuery(api.payroll.monthPayroll, { month });
  const due = useQuery(api.finance.dueReminders, {}) ?? [];

  if (!summary) return <div className="body">Loading…</div>;
  const cur = summary.currency;

  const incomeRows = Object.entries(summary.byCategory).filter(([, v]) => v > 0);
  const costRows = Object.entries(summary.byCategory).filter(([, v]) => v < 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <select
          className="input"
          style={{ width: "auto" }}
          value={summary.month}
          onChange={(e) => setMonth(e.target.value)}
        >
          {summary.months.map((m: string) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
        {summary.estimatedPortion > 0 && (
          <span className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>
            Includes {money(summary.estimatedPortion, cur)} of metered estimates
          </span>
        )}
      </div>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#047857" }}>
            {money(summary.income, cur)}
          </div>
          <div className="body-sm">Income</div>
        </div>
        <div className="card" style={{ padding: 18 }}>
          <div style={{ fontSize: 26, fontWeight: 700, color: "#B91C1C" }}>
            {money(summary.costs, cur)}
          </div>
          <div className="body-sm">Costs</div>
        </div>
        <div className="card" style={{ padding: 18, background: "var(--brand-purple)", color: "#fff" }}>
          <div style={{ fontSize: 26, fontWeight: 700 }}>{money(summary.net, cur)}</div>
          <div className="body-sm" style={{ color: "#fff", opacity: 0.85 }}>Net</div>
        </div>
      </div>

      {(due.length > 0 || (payroll && payroll.totals.unpaid > 0)) && (
        <div className="card" style={{ padding: 16, marginBottom: 16, borderColor: "#D97706", background: "#FFFBEB" }}>
          <div className="h3" style={{ marginBottom: 6, fontSize: 15 }}>Still to record</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {payroll && payroll.totals.unpaid > 0 && (
              <span className="chip">
                Teacher salaries <strong style={{ marginInlineStart: 4 }}>{money(payroll.totals.unpaid, payroll.currency)}</strong>
              </span>
            )}
            {due.map((d: any) => (
              <span key={d._id} className="chip">
                {d.label}
                {d.expectedAmount ? ` · ~${money(d.expectedAmount, d.currency)}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="split-2-1">
        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 10 }}>Where it came from</div>
          {incomeRows.length === 0 ? (
            <div className="body-sm">No income recorded this month.</div>
          ) : (
            incomeRows.map(([cat, v]) => (
              <Row key={cat} label={CATEGORY_LABELS[cat] ?? cat} value={money(v, cur)} />
            ))
          )}
          <div className="h3" style={{ margin: "18px 0 10px" }}>Where it went</div>
          {costRows.length === 0 ? (
            <div className="body-sm">No costs recorded this month.</div>
          ) : (
            costRows.map(([cat, v]) => (
              <Row key={cat} label={CATEGORY_LABELS[cat] ?? cat} value={money(Math.abs(v), cur)} tone="#B91C1C" />
            ))
          )}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 10 }}>This month&apos;s teaching</div>
          {payroll ? (
            <>
              <Row label="Lessons awaiting payment" value={String(payroll.totals.lessonsUnpaid)} />
              <Row label="Owed to teachers" value={money(payroll.totals.unpaid, payroll.currency)} />
              <Row label="Already paid" value={money(payroll.totals.paid, payroll.currency)} last />
            </>
          ) : (
            <div className="body-sm">Loading…</div>
          )}
          <p className="body-sm" style={{ marginTop: 12, color: "var(--omnic-gray-500)" }}>
            Pack sales book themselves. Salaries land here when you approve a
            payment in Payroll; everything else you enter under Expenses.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone, last }: { label: string; value: string; tone?: string; last?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "8px 0",
        borderBottom: last ? "none" : "1px solid var(--omnic-gray-100)",
      }}
    >
      <span className="body-sm">{label}</span>
      <strong style={{ color: tone, whiteSpace: "nowrap" }}>{value}</strong>
    </div>
  );
}

// ── Payroll ──────────────────────────────────────────────────────────

export function PayrollTab() {
  const [month, setMonth] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const payroll = useQuery(api.payroll.monthPayroll, { month });
  const payTeacher = useMutation(api.payroll.payTeacher);
  const setRate = useMutation(api.payroll.setTeacherRate);
  const undoRun = useMutation(api.payroll.undoRun);
  const [busy, setBusy] = useState<string | null>(null);
  const [rateFor, setRateFor] = useState<{ teacherId: string; name: string; rate: number } | null>(null);

  if (!payroll) return <div className="body">Loading…</div>;
  const cur = payroll.currency;

  // Last 12 months, so a late payment for an old month is still possible.
  const months: string[] = [];
  const base = new Date();
  for (let i = 0; i < 12; i++) {
    months.push(new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() - i, 1)).toISOString().slice(0, 7));
  }

  async function pay(row: any) {
    if (
      !confirm(
        `Mark ${row.name} paid for ${row.lessonsUnpaid} lesson${row.lessonsUnpaid === 1 ? "" : "s"} — ${money(row.amountUnpaid, cur)}?\n\nThis records the payment and clears their unpaid balance.`
      )
    )
      return;
    setBusy(row.teacherId);
    try {
      await payTeacher({
        teacherId: row.teacherId,
        month: payroll!.month,
        expectedLessons: row.lessonsUnpaid,
      });
      toast.success(`Recorded ${money(row.amountUnpaid, cur)} to ${row.name}`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}>
        <select className="input" style={{ width: "auto" }} value={month} onChange={(e) => setMonth(e.target.value)}>
          {months.map((m) => (
            <option key={m} value={m}>{monthLabel(m)}</option>
          ))}
        </select>
        <span className="body-sm">
          Paid per lesson done — completed lessons and charged student no-shows (POLICY §4).
        </span>
      </div>

      {payroll.missingRates.length > 0 && (
        <div className="card" style={{ padding: 14, marginBottom: 14, borderColor: "#D97706", background: "#FFFBEB" }}>
          <span className="body-sm">
            No per-lesson rate set for <strong>{payroll.missingRates.join(", ")}</strong> — set one before paying.
          </span>
        </div>
      )}

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Teacher</th>
              <th>Rate</th>
              <th>Lessons</th>
              <th>Unpaid</th>
              <th>Owed</th>
              <th>Paid this month</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {payroll.rows.map((r: any) => (
              <tr key={r.teacherId}>
                <td style={{ fontWeight: 600, whiteSpace: "nowrap" }}>{r.name}</td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => setRateFor({ teacherId: r.teacherId, name: r.name, rate: r.rate })}
                    title="Change the per-lesson rate"
                  >
                    {r.rate > 0 ? money(r.rate, cur) : "Set rate"}
                    {r.rateIsDefault && r.rate > 0 ? " (default)" : ""}
                  </button>
                </td>
                <td>{r.lessonsPayable}</td>
                <td style={{ fontWeight: 700 }}>{r.lessonsUnpaid}</td>
                <td style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{money(r.amountUnpaid, cur)}</td>
                <td className="muted" style={{ whiteSpace: "nowrap" }}>
                  {r.amountPaid > 0 ? money(r.amountPaid, cur) : "—"}
                  {r.lastPaidAt && (
                    <div style={{ fontSize: 11 }}>{new Date(r.lastPaidAt).toLocaleDateString()}</div>
                  )}
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button
                    className="btn btn-tenant btn-sm"
                    disabled={r.lessonsUnpaid === 0 || r.rate <= 0 || busy === r.teacherId}
                    onClick={() => void pay(r)}
                  >
                    {busy === r.teacherId ? "Saving…" : "Mark paid"}
                  </button>
                </td>
              </tr>
            ))}
            {payroll.rows.length === 0 && (
              <tr>
                <td colSpan={7} className="body-sm" style={{ padding: 28, textAlign: "center" }}>
                  No teachers yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {payroll.rows.some((r: any) => r.runs.length > 0) && (
        <div className="card" style={{ padding: 20, marginTop: 16 }}>
          <div className="h3" style={{ marginBottom: 10 }}>Payments this month</div>
          {payroll.rows.flatMap((r: any) =>
            r.runs.map((run: any) => (
              <div
                key={run._id}
                style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--omnic-gray-100)" }}
              >
                <span className="body-sm">
                  <strong>{r.name}</strong> · {run.lessonCount} lesson{run.lessonCount === 1 ? "" : "s"} ·{" "}
                  {money(run.amount, cur)} · {new Date(run.paidAt).toLocaleDateString()}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={async () => {
                    if (!confirm("Undo this payment? The lessons go back to unpaid and the ledger entry is removed.")) return;
                    try {
                      await undoRun({ runId: run._id });
                      toast.success("Payment undone");
                    } catch (e) {
                      toast.error((e as Error).message);
                    }
                  }}
                >
                  Undo
                </button>
              </div>
            ))
          )}
        </div>
      )}

      {rateFor && (
        <RateDialog
          teacher={rateFor}
          currency={cur}
          onClose={() => setRateFor(null)}
          onSave={async (value) => {
            await setRate({ teacherId: rateFor.teacherId, ratePerLesson: value });
            toast.success("Rate saved");
            setRateFor(null);
          }}
        />
      )}
    </div>
  );
}

function RateDialog({
  teacher,
  currency,
  onClose,
  onSave,
}: {
  teacher: { name: string; rate: number };
  currency: string;
  onClose: () => void;
  onSave: (value: number | null) => Promise<void>;
}) {
  const [value, setValue] = useState(String(teacher.rate || ""));
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={`Rate for ${teacher.name}`} onClose={onClose}>
      <p className="body-sm" style={{ marginBottom: 12 }}>
        Paid for every lesson done. Leave empty to fall back to the academy
        default. Changing it affects future payments only — payments already
        recorded keep the rate they were paid at.
      </p>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input
          className="input"
          type="number"
          min="0"
          step="0.01"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          style={{ maxWidth: 180 }}
        />
        <span className="body-sm">{currency} per lesson</span>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-tenant"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(value.trim() === "" ? null : Number(value));
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save rate"}
        </button>
      </div>
    </Modal>
  );
}

// ── Expenses + reminders ─────────────────────────────────────────────

export function ExpensesTab() {
  const entries = useQuery(api.finance.listEntries, {}) ?? [];
  const reminders = useQuery(api.finance.listReminders, {}) ?? [];
  const summary = useQuery(api.finance.monthSummary, {});
  const addEntry = useMutation(api.finance.addEntry);
  const deleteEntry = useMutation(api.finance.deleteEntry);
  const skipPeriod = useMutation(api.finance.skipReminderPeriod);
  const deleteReminder = useMutation(api.finance.deleteReminder);

  const [form, setForm] = useState({
    category: "ads" as (typeof MANUAL_CATEGORIES)[number],
    amount: "",
    date: today(),
    note: "",
    reminderId: undefined as string | undefined,
  });
  const [busy, setBusy] = useState(false);
  const [editingReminder, setEditingReminder] = useState<any | null>(null);
  const cur = summary?.currency ?? "USD";

  async function submit() {
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error("Enter an amount");
      return;
    }
    setBusy(true);
    try {
      await addEntry({
        direction: "out",
        category: form.category,
        amount: Number(form.amount),
        date: form.date,
        note: form.note.trim() || undefined,
        reminderId: form.reminderId as any,
      });
      toast.success("Recorded");
      setForm({ category: form.category, amount: "", date: today(), note: "", reminderId: undefined });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const manualEntries = entries.filter((e: any) => e.source === "manual" || e.category !== "pack_sale");

  return (
    <div className="split-2-1">
      <div>
        <div className="card" style={{ padding: 20, marginBottom: 16 }}>
          <div className="h3" style={{ marginBottom: 12 }}>Record a cost</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <div>
              <label className="label" style={{ display: "block", marginBottom: 4 }}>Category</label>
              <select
                className="input"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value as any })}
              >
                {MANUAL_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" style={{ display: "block", marginBottom: 4 }}>Amount ({cur})</label>
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div>
              <label className="label" style={{ display: "block", marginBottom: 4 }}>Date</label>
              <input
                className="input"
                type="date"
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </div>
          </div>
          <div style={{ marginTop: 10 }}>
            <label className="label" style={{ display: "block", marginBottom: 4 }}>Note</label>
            <input
              className="input"
              placeholder="What was it for?"
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <button className="btn btn-tenant" disabled={busy} onClick={() => void submit()}>
              {busy ? "Saving…" : "Record cost"}
            </button>
          </div>
        </div>

        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Category</th>
                <th>Amount</th>
                <th>Note</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {manualEntries.map((e: any) => (
                <tr key={e._id}>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{e.date}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {CATEGORY_LABELS[e.category] ?? e.category}
                    {e.isEstimate && (
                      <span className="pill pill-new" style={{ fontSize: 10, marginInlineStart: 6 }}>estimate</span>
                    )}
                  </td>
                  <td style={{ fontWeight: 600, whiteSpace: "nowrap", color: e.direction === "in" ? "#047857" : "#B91C1C" }}>
                    {e.direction === "in" ? "+" : "−"}{money(e.amount, e.currency)}
                  </td>
                  <td className="muted">{e.note ?? "—"}</td>
                  <td>
                    {!e.payrollRunId && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={async () => {
                          if (!confirm("Delete this entry?")) return;
                          try {
                            await deleteEntry({ id: e._id });
                            toast.success("Deleted");
                          } catch (err) {
                            toast.error((err as Error).message);
                          }
                        }}
                      >
                        <Icon name="trash" size={12} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {manualEntries.length === 0 && (
                <tr>
                  <td colSpan={5} className="body-sm" style={{ padding: 28, textAlign: "center" }}>
                    Nothing recorded yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
          <div className="h3" style={{ margin: 0 }}>Reminders</div>
          <button className="btn btn-ghost btn-sm" onClick={() => setEditingReminder({})}>
            <Icon name="plus" size={12} /> New
          </button>
        </div>
        <p className="body-sm" style={{ margin: "6px 0 12px" }}>
          Costs that repeat and can&apos;t be detected — salary, ads, subscriptions.
          You get a notification when one is due and nothing has been entered.
        </p>
        {reminders.length === 0 && <div className="body-sm">No reminders yet.</div>}
        {reminders.map((r: any) => (
          <div key={r._id} style={{ padding: "10px 0", borderBottom: "1px solid var(--omnic-gray-100)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
              <strong style={{ fontSize: 13 }}>{r.label}</strong>
              {r.due ? (
                <span className="pill" style={{ fontSize: 10, background: "#FEF3C7", color: "#92400E" }}>due</span>
              ) : (
                <span className="pill pill-active" style={{ fontSize: 10 }}>done</span>
              )}
            </div>
            <div className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>
              {CATEGORY_LABELS[r.category]} ·{" "}
              {r.cadence === "monthly"
                ? `monthly on day ${r.dayOfMonth}`
                : r.cadence === "weekly"
                  ? "weekly"
                  : `once on ${r.onceDate}`}
              {r.expectedAmount ? ` · ~${money(r.expectedAmount, r.currency)}` : ""}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              {r.due && (
                <>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() =>
                      setForm({
                        category: r.category,
                        amount: r.expectedAmount ? String(r.expectedAmount) : "",
                        date: today(),
                        note: r.label,
                        reminderId: r._id,
                      })
                    }
                  >
                    Enter it
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={async () => {
                      await skipPeriod({ id: r._id });
                      toast.success("Marked done for this period");
                    }}
                  >
                    Nothing this time
                  </button>
                </>
              )}
              <button className="btn btn-ghost btn-sm" onClick={() => setEditingReminder(r)}>
                <Icon name="edit" size={12} />
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={async () => {
                  if (!confirm(`Delete the "${r.label}" reminder?`)) return;
                  await deleteReminder({ id: r._id });
                  toast.success("Deleted");
                }}
              >
                <Icon name="trash" size={12} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {editingReminder && (
        <ReminderDialog
          reminder={editingReminder}
          currency={cur}
          onClose={() => setEditingReminder(null)}
        />
      )}
    </div>
  );
}

function ReminderDialog({
  reminder,
  currency,
  onClose,
}: {
  reminder: any;
  currency: string;
  onClose: () => void;
}) {
  const upsert = useMutation(api.finance.upsertReminder);
  const [label, setLabel] = useState(reminder.label ?? "");
  const [category, setCategory] = useState(reminder.category ?? "subscriptions");
  const [amount, setAmount] = useState(reminder.expectedAmount ? String(reminder.expectedAmount) : "");
  const [cadence, setCadence] = useState(reminder.cadence ?? "monthly");
  const [dayOfMonth, setDayOfMonth] = useState(String(reminder.dayOfMonth ?? 1));
  const [onceDate, setOnceDate] = useState(reminder.onceDate ?? today());
  const [busy, setBusy] = useState(false);

  return (
    <Modal title={reminder._id ? "Edit reminder" : "New reminder"} onClose={onClose}>
      <div style={{ display: "grid", gap: 10 }}>
        <div>
          <label className="label" style={{ display: "block", marginBottom: 4 }}>Name</label>
          <input className="input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Instagram ads" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="label" style={{ display: "block", marginBottom: 4 }}>Category</label>
            <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>
              {MANUAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" style={{ display: "block", marginBottom: 4 }}>Usual amount ({currency})</label>
            <input className="input" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div>
            <label className="label" style={{ display: "block", marginBottom: 4 }}>How often</label>
            <select className="input" value={cadence} onChange={(e) => setCadence(e.target.value)}>
              <option value="monthly">Every month</option>
              <option value="weekly">Every week</option>
              <option value="once">Once</option>
            </select>
          </div>
          {cadence === "monthly" ? (
            <div>
              <label className="label" style={{ display: "block", marginBottom: 4 }}>Day of month</label>
              <input className="input" type="number" min="1" max="28" value={dayOfMonth} onChange={(e) => setDayOfMonth(e.target.value)} />
            </div>
          ) : cadence === "once" ? (
            <div>
              <label className="label" style={{ display: "block", marginBottom: 4 }}>Date</label>
              <input className="input" type="date" value={onceDate} onChange={(e) => setOnceDate(e.target.value)} />
            </div>
          ) : (
            <div />
          )}
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-tenant"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await upsert({
                id: reminder._id,
                label,
                category: category as any,
                expectedAmount: amount ? Number(amount) : undefined,
                cadence: cadence as any,
                dayOfMonth: cadence === "monthly" ? Number(dayOfMonth) : undefined,
                onceDate: cadence === "once" ? onceDate : undefined,
              });
              toast.success("Saved");
              onClose();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Saving…" : "Save reminder"}
        </button>
      </div>
    </Modal>
  );
}

// ── Money ledger ─────────────────────────────────────────────────────

export function MoneyLedgerTab() {
  const entries = useQuery(api.finance.listEntries, {}) ?? [];
  if (entries.length === 0) {
    return (
      <div className="card" style={{ padding: 40, textAlign: "center" }}>
        <Icon name="dollar" size={32} stroke="var(--omnic-gray-300)" />
        <div className="body" style={{ marginTop: 12 }}>
          Nothing booked yet. Pack sales appear here automatically; costs when
          you record them.
        </div>
      </div>
    );
  }
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Date</th>
            <th>Category</th>
            <th>In / out</th>
            <th>Amount</th>
            <th>Source</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e: any) => (
            <tr key={e._id}>
              <td className="muted" style={{ whiteSpace: "nowrap" }}>{e.date}</td>
              <td style={{ whiteSpace: "nowrap" }}>{CATEGORY_LABELS[e.category] ?? e.category}</td>
              <td>
                <span className={`pill ${e.direction === "in" ? "pill-active" : "pill-paused"}`}>
                  {e.direction === "in" ? "in" : "out"}
                </span>
              </td>
              <td style={{ fontWeight: 600, whiteSpace: "nowrap", color: e.direction === "in" ? "#047857" : "#B91C1C" }}>
                {e.direction === "in" ? "+" : "−"}{money(e.amount, e.currency)}
              </td>
              <td className="muted">
                {e.source === "auto" ? "automatic" : "manual"}
                {e.isEstimate ? " · estimate" : ""}
              </td>
              <td className="muted">{e.note ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Shared modal ─────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(17,17,17,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        zIndex: 60,
      }}
    >
      <div onClick={(e) => e.stopPropagation()} className="card" style={{ padding: 22, width: "min(560px, 100%)", maxHeight: "88vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div className="h3" style={{ margin: 0 }}>{title}</div>
          <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Close">
            <Icon name="x" size={14} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
