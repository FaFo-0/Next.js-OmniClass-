"use client";

import { use } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";
import { StatusPill } from "@/components/shared/StatusPill";
import { formatTime } from "@/lib/timeFormat";
import { flagEmoji, LocalClock } from "@/components/shared/studentBits";

const STATUS_LABEL: Record<string, string> = {
  completed: "Done",
  scheduled: "Upcoming",
  makeup: "Make-up",
  no_show_student: "No-show",
  no_show_teacher: "Teacher no-show",
  cancelled: "Cancelled",
};

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <span className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value ?? "—"}</span>
    </div>
  );
}

/**
 * Native language, editable in place.
 *
 * Everything a student studies from is word → meaning in THIS language, so a
 * missing value quietly turns every flashcard English-only. Onboarding doesn't
 * always capture it (and older students predate the question), so a teacher
 * has to be able to set it in one click from the profile.
 */
function NativeLanguageField({
  studentId,
  value,
}: {
  studentId: string;
  value: string | null;
}) {
  const setL1 = useMutation(api.users.setStudentL1);
  const current = (value ?? "").toLowerCase().slice(0, 2);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>
        Native language
      </span>
      <div style={{ display: "flex", gap: 6 }}>
        {[
          ["ru", "Russian"],
          ["ar", "Arabic"],
          ["en", "English"],
        ].map(([code, label]) => (
          <button
            key={code}
            className="chip"
            onClick={async () => {
              try {
                await setL1({ studentId, l1: code });
                toast.success(`Native language set to ${label}`);
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
            style={
              current === code
                ? {
                    background: "var(--brand-purple)",
                    color: "#fff",
                    borderColor: "var(--brand-purple)",
                  }
                : undefined
            }
          >
            {label}
          </button>
        ))}
      </div>
      {!value && (
        <span className="body-sm" style={{ color: "#92400E" }}>
          Not set — flashcards can&apos;t be translated yet.
        </span>
      )}
    </div>
  );
}

function StatCard({ n, label }: { n: number; label: string }) {
  return (
    <div className="card" style={{ padding: 16, flex: "1 1 120px", minWidth: 120 }}>
      <div style={{ fontSize: 28, fontWeight: 700 }}>{n}</div>
      <div className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>{label}</div>
    </div>
  );
}

export default function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const data = useQuery(api.users.getStudentDetailForTeacher, { studentId: id });
  // Clock preference follows the viewer everywhere, not just the calendar.
  const me = useQuery(api.users.getMe);
  const timeFmt: "12h" | "24h" = me?.timeFormat ?? "24h";

  return (
    <div style={{ maxWidth: 900 }}>
      <Link href="/teacher/students" className="body-sm" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 16, color: "var(--brand-purple)" }}>
        <Icon name="chevronLeft" size={14} /> All students
      </Link>

      {data === undefined ? (
        <div className="card body-sm" style={{ padding: 40, textAlign: "center" }}>Loading…</div>
      ) : data === null ? (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>Student not found.</div>
      ) : (
        <>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
            <span className="avatar" style={{ width: 56, height: 56, fontSize: 20 }}>
              {data.student.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1 className="h1" style={{ margin: 0 }}>
                {flagEmoji(data.profile.country) && (
                  <span style={{ marginInlineEnd: 8 }} title={data.profile.country ?? ""}>
                    {flagEmoji(data.profile.country)}
                  </span>
                )}
                {data.student.name}
              </h1>
              <div className="body-sm" style={{ color: "var(--omnic-gray-500)", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                <span>{data.student.email}</span>
                {data.student.timezone && (
                  <LocalClock tz={data.student.timezone} fmt={timeFmt} />
                )}
              </div>
            </div>
            <StatusPill status={data.student.status} />
          </div>

          {/* Balance + stats */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <div className="card" style={{ padding: 16, flex: "1 1 180px", minWidth: 160, background: "var(--brand-purple)", color: "#fff" }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{data.balance}</div>
              <div className="body-sm" style={{ opacity: 0.9 }}>
                lesson{data.balance === 1 ? "" : "s"} left
                {data.nextExpiresAt ? ` · expires ${data.nextExpiresAt}` : ""}
              </div>
            </div>
            <StatCard n={data.stats.completed} label="completed" />
            <StatCard n={data.stats.upcoming} label="upcoming" />
            <StatCard n={data.stats.noShow} label="no-shows" />
          </div>

          {/* Profile / contact */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div className="h3" style={{ marginBottom: 16 }}>Profile</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 16 }}>
              <Field label="Phone / WhatsApp" value={data.student.phone} />
              <Field label="English level" value={data.profile.englishLevel} />
              <NativeLanguageField studentId={id} value={data.profile.l1} />
              <Field label="Country" value={data.profile.country} />
              <Field label="Age" value={data.profile.age} />
              <Field label="Timezone" value={data.student.timezone} />
              <Field label="Goal" value={data.profile.goal} />
              <Field label="Preferred times" value={data.profile.preferredTimes} />
            </div>
          </div>

          {/* Homework */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div className="h3" style={{ marginBottom: 12 }}>Homework</div>
            <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
              <Field label="Assigned / in progress" value={data.homework.assigned} />
              <Field label="Awaiting review" value={data.homework.submitted} />
              <Field label="Reviewed" value={data.homework.reviewed} />
            </div>
          </div>

          {/* Recent lessons */}
          <div className="card" style={{ padding: 20 }}>
            <div className="h3" style={{ marginBottom: 12 }}>Recent lessons</div>
            {data.recentLessons.length === 0 ? (
              <div className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>No lessons yet.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column" }}>
                {data.recentLessons.map((l) => (
                  <div key={l._id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid var(--omnic-gray-100)" }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{l.title}</div>
                      <div className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>
                        {l.date} · {formatTime(l.startTime, timeFmt)}–{formatTime(l.endTime, timeFmt)}
                      </div>
                    </div>
                    <span className="body-sm" style={{ fontWeight: 600 }}>
                      {STATUS_LABEL[l.status] ?? l.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
