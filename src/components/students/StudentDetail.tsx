"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { toast } from "sonner";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";
import { StatusPill } from "@/components/shared/StatusPill";
import { formatTime } from "@/lib/timeFormat";
import { isNoExpiry } from "@/lib/expiry";
import { flagEmoji } from "@/components/shared/studentBits";
import { PersonTime } from "@/components/shared/PersonTime";

const DAY_LABEL: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

const TIME_LABEL: Record<string, string> = {
  morning: "mornings", afternoon: "afternoons", evening: "evenings", late: "late nights",
};

const INTEREST_LABEL: Record<string, string> = {
  business: "Business", travel: "Travel", exams: "IELTS / exams", tech: "Tech",
  culture: "Culture", news: "News", movies: "Films & TV", sport: "Sport",
  science: "Science",
};

const REFERRAL_LABEL: Record<string, string> = {
  friend: "a friend", instagram: "Instagram", google: "Google",
  telegram: "Telegram", other: "somewhere else",
};

/** Small read-only chips — the student's own answers, not editable here. */
function Tags({ values, labels }: { values?: string[] | null; labels?: Record<string, string> }) {
  // Tolerate a backend that predates these fields — a profile page should
  // never white-screen because one answer is missing.
  const list = values ?? [];
  if (list.length === 0) return <span style={{ fontWeight: 600 }}>—</span>;
  return (
    <span style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {list.map((v) => (
        <span key={v} className="pill pill-new" style={{ fontSize: 11 }}>
          {labels?.[v] ?? v}
        </span>
      ))}
    </span>
  );
}

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

export function StudentDetail({
  id,
  backHref,
  backLabel,
}: {
  id: string;
  backHref: string;
  backLabel: string;
}) {
  const data = useQuery(api.users.getStudentDetailForTeacher, { studentId: id });
  // Clock preference follows the viewer everywhere, not just the calendar.
  const me = useQuery(api.users.getMe);
  const timeFmt: "12h" | "24h" = me?.timeFormat ?? "24h";

  return (
    <div style={{ maxWidth: 900 }}>
      <Link href={backHref} className="body-sm" style={{ display: "inline-flex", alignItems: "center", gap: 4, marginBottom: 16, color: "var(--brand-purple)" }}>
        <Icon name="chevronLeft" size={14} /> {backLabel}
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
                <PersonTime tz={data.student.timezone} fmt={timeFmt} />
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
                {data.nextExpiresAt
                  ? isNoExpiry(data.nextExpiresAt)
                    ? " · never expires"
                    : ` · expires ${data.nextExpiresAt}`
                  : ""}
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
              {data.student.guardianName && (
                <Field
                  label="Guardian"
                  value={
                    data.student.guardianPhone
                      ? `${data.student.guardianName} · ${data.student.guardianPhone}`
                      : data.student.guardianName
                  }
                />
              )}
              <Field label="English level" value={data.profile.englishLevel} />
              <NativeLanguageField studentId={id} value={data.profile.l1} />
              <Field label="Country" value={data.profile.country} />
              <Field label="Age" value={data.profile.age} />
              <Field label="Timezone" value={data.student.timezone} />
              <Field label="Goal" value={data.profile.goal} />
            </div>
          </div>

          {/* What they told us at signup. Availability is the one a teacher
              acts on — slots get opened against it. */}
          <div className="card" style={{ padding: 20, marginBottom: 20 }}>
            <div className="h3" style={{ marginBottom: 16 }}>From their signup</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16 }}>
              <Field
                label="Days they can study"
                value={<Tags values={data.profile.preferredDays} labels={DAY_LABEL} />}
              />
              <Field
                label="Times of day"
                value={<Tags values={data.profile.preferredTimeOfDay} labels={TIME_LABEL} />}
              />
              <Field
                label="Topics they enjoy"
                value={<Tags values={data.profile.interests} labels={INTEREST_LABEL} />}
              />
              <Field label="In their words" value={data.profile.preferredTimes} />
              <Field
                label="Found us via"
                value={
                  data.profile.referralSource
                    ? (REFERRAL_LABEL[data.profile.referralSource] ?? data.profile.referralSource)
                    : null
                }
              />
              <Field
                label="Signed up"
                value={
                  data.profile.onboardedAt
                    ? new Date(data.profile.onboardedAt).toLocaleDateString()
                    : null
                }
              />
              <Field
                label="Recording consent"
                value={
                  data.profile.consentAcceptedAt ? (
                    <span style={{ color: "#15803D", fontWeight: 600 }}>
                      Given {new Date(data.profile.consentAcceptedAt).toLocaleDateString()}
                    </span>
                  ) : (
                    <span style={{ color: "#92400E", fontWeight: 600 }}>Not on file</span>
                  )
                }
              />
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
