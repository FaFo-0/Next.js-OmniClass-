"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { toast } from "sonner";
import { AccountCard } from "@/components/shared/AccountCard";
import { Icon } from "@/components/shared/icons";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: tone ?? "var(--omnic-gray-900)" }}>{value}</div>
      <div className="body-sm" style={{ marginTop: 2 }}>{label}</div>
    </div>
  );
}

export default function TeacherProfilePage() {
  const me = useQuery(api.users.getMe);
  const pay = useQuery(api.payroll.myPayroll, {});
  const weeklyHours = useQuery(api.vacancies.getWeeklyHours, {});
  const roster = useQuery(api.users.getStudentRosterForTeacher, {}) ?? [];
  const setMeetLink = useMutation(api.users.setMeetLink);
  const updateProfile = useMutation(api.users.updateMyProfile);
  const [link, setLink] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Written at onboarding; this is where it's changed afterwards. `null`
  // means "not being edited" so a saved value isn't shadowed by stale state.
  const [bio, setBio] = useState<string | null>(null);
  const [savingBio, setSavingBio] = useState(false);
  const bioValue = bio ?? me?.bio ?? "";
  const ielts = me?.ieltsCertified ?? false;

  async function saveTeaching(next?: { ieltsCertified?: boolean }) {
    setSavingBio(true);
    try {
      await updateProfile({ bio: bioValue, ...next });
      toast.success("Teaching profile saved");
      setBio(null);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSavingBio(false);
    }
  }

  const value = link ?? me?.meetLink ?? "";

  async function saveLink() {
    setSaving(true);
    try {
      await setMeetLink({ meetLink: value.trim() });
      toast.success("Meeting room saved");
      setLink(null);
    } catch (error) {
      toast.error((error as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ maxWidth: 980, margin: "0 auto" }}>
      <div style={{ maxWidth: 560 }}>
        <AccountCard />
      </div>

      <div className="grid-3" style={{ marginBottom: 16 }}>
        <Metric label="Assigned students" value={roster.length} />
        <Metric label="Open each week" value={weeklyHours === undefined ? "…" : `${weeklyHours.toFixed(1)} h`} />
        <Metric label="Lessons this month" value={pay?.lessonsThisMonth ?? 0} />
      </div>

      <div className="split-2-1" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 8 }}>Your meeting room</div>
          <p className="body-sm" style={{ marginBottom: 12 }}>
            Your permanent Google Meet link is automatically added to new lessons.
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Input
              value={value}
              onChange={(event) => setLink(event.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
              style={{ flex: "1 1 260px" }}
            />
            <button className="btn btn-tenant" onClick={() => void saveLink()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
          {!me?.meetLink && !link && (
            <div className="body-sm" style={{ marginTop: 10, color: "#92400E" }}>
              Add this before running a new lesson so students always have the right room.
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 20, background: "var(--brand-purple)", color: "#fff" }}>
          <div className="body-sm" style={{ color: "#fff", opacity: 0.82 }}>Owed to you</div>
          <div style={{ fontSize: 30, fontWeight: 700, marginTop: 8 }}>
            {pay ? `${pay.amountUnpaid.toLocaleString()} ${pay.currency}` : "…"}
          </div>
          <div className="body-sm" style={{ color: "#fff", opacity: 0.86, marginTop: 4 }}>
            {pay?.lessonsUnpaid ?? 0} unpaid lesson{pay?.lessonsUnpaid === 1 ? "" : "s"} this month
            {pay && pay.rate > 0 ? ` · ${pay.rate} ${pay.currency} each` : ""}
          </div>
          <div className="body-sm" style={{ color: "#fff", opacity: 0.72, marginTop: 12 }}>
            {pay?.lastPayment
              ? `Last payment ${new Date(pay.lastPayment.paidAt).toLocaleDateString()} — ${pay.lastPayment.amount} ${pay.currency} for ${pay.lastPayment.lessons} lesson${pay.lastPayment.lessons === 1 ? "" : "s"}.`
              : "Completed lessons and charged student no-shows count (POLICY §4)."}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 8 }}>Your introduction</div>
        <p className="body-sm" style={{ marginBottom: 12 }}>
          What your students read before their first lesson with you.
        </p>
        <Textarea
          rows={4}
          value={bioValue}
          onChange={(event) => setBio(event.target.value)}
          placeholder="e.g. I'm from Almaty and I've taught business English for six years."
        />
        <div
          className="body-sm"
          style={{
            marginTop: 6,
            color: bioValue.trim().length > 400 ? "#92400E" : undefined,
          }}
        >
          {bioValue.trim().length} of 400 characters
        </div>
        <label
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            marginTop: 12,
            cursor: "pointer",
          }}
        >
          <input
            type="checkbox"
            checked={ielts}
            onChange={(event) => void saveTeaching({ ieltsCertified: event.target.checked })}
          />
          <span className="body-sm">
            I&apos;m IELTS certified — the academy uses this when matching exam students.
          </span>
        </label>
        <button
          className="btn btn-tenant btn-sm"
          style={{ marginTop: 12 }}
          onClick={() => void saveTeaching()}
          disabled={savingBio || bioValue.trim().length > 400}
        >
          {savingBio ? "Saving…" : "Save introduction"}
        </button>
      </div>

      <div className="split-2-1">
        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 12 }}>Your students</div>
          {roster.length === 0 ? (
            <div className="body-sm">No students are assigned to you yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {roster.slice(0, 5).map((student) => (
                <Link
                  href={`/teacher/students/${student.externalId}`}
                  key={student.externalId}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "10px 0", borderBottom: "1px solid var(--omnic-gray-100)", textDecoration: "none", color: "inherit" }}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{student.name}</div>
                    <div className="body-sm">{student.balance} lesson{student.balance === 1 ? "" : "s"} left</div>
                  </div>
                  <Icon name="chevronRight" size={15} stroke="var(--omnic-gray-400)" />
                </Link>
              ))}
            </div>
          )}
          <Link href="/teacher/students" className="btn btn-secondary btn-sm" style={{ marginTop: 14 }}>
            View all students <Icon name="chevronRight" size={14} />
          </Link>
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 12 }}>Teaching setup</div>
          <div className="body-sm" style={{ marginBottom: 12 }}>
            {weeklyHours === undefined
              ? "Loading availability…"
              : weeklyHours > 0
                ? `${weeklyHours.toFixed(1)} open hours each week`
                : "No weekly availability is open yet"}
          </div>
          <Link href="/teacher/calendar" className="btn btn-tenant btn-block">
            <Icon name="calendar" size={15} /> Manage availability and time off
          </Link>
          <Link href="/teacher/sessions" className="btn btn-secondary btn-block" style={{ marginTop: 8 }}>
            <Icon name="video" size={15} /> View sessions
          </Link>
        </div>
      </div>
    </div>
  );
}
