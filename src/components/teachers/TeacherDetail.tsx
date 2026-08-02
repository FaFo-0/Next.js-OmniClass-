"use client";

import Link from "next/link";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { ArrowLeft, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Icon } from "@/components/shared/icons";
import { StatusPill } from "@/components/shared/StatusPill";
import { PersonTime } from "@/components/shared/PersonTime";
import { AvailabilityBoard } from "@/components/calendar/AvailabilityBoard";
import { Button } from "@/components/ui/button";
import { formatTime, type TimeFormat } from "@/lib/timeFormat";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateLabel(date: string) {
  return new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 24, fontWeight: 700, color: tone ?? "var(--omnic-gray-900)" }}>
        {value}
      </div>
      <div className="body-sm" style={{ marginTop: 2 }}>{label}</div>
    </div>
  );
}

/** The admin-only operating view for a teacher. */
export function TeacherDetail({ id }: { id: string }) {
  const data = useQuery(api.users.getTeacherDetailForAdmin, { teacherId: id });
  const earnings = useQuery(api.reports.teacherEarnings, { teacherId: id });
  const me = useQuery(api.users.getMe);
  const approveTimeOff = useMutation(api.calendar.approveTimeOff);
  const timeFormat: TimeFormat = me?.timeFormat ?? "24h";

  async function approve(groupId: string) {
    try {
      await approveTimeOff({ groupId });
      toast.success("Time off acknowledged");
    } catch (error) {
      toast.error((error as Error).message);
    }
  }

  if (data === undefined) {
    return <div className="body">Loading teacher…</div>;
  }
  if (!data) {
    return (
      <div>
        <Link href="/admin/people" className="link body-sm">
          <ArrowLeft size={13} className="inline me-1" /> Back to People
        </Link>
        <div className="card" style={{ padding: 28, marginTop: 16 }}>Teacher not found.</div>
      </div>
    );
  }

  const { teacher, availability, stats } = data;
  const initials = teacher.name.split(" ").map((part) => part[0]).join("").slice(0, 2);
  const ratePercent = Math.round((earnings?.rate ?? teacher.payoutRate) * 100);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto" }}>
      <Link href="/admin/people" className="link body-sm" style={{ display: "inline-block", marginBottom: 16 }}>
        <ArrowLeft size={13} className="inline me-1" /> Back to People
      </Link>

      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
            <span className="avatar avatar-lg">{initials}</span>
            <div>
              <h1 className="h1" style={{ margin: 0 }}>{teacher.name}</h1>
              <div className="body" style={{ marginTop: 4 }}>{teacher.email}</div>
              <div
                className="body-sm"
                style={{ marginTop: 6, color: "var(--omnic-gray-500)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
              >
                {/* Their clock, ticking — nobody should do timezone maths
                    before messaging a teacher or moving a lesson. */}
                <PersonTime tz={teacher.timezone} fmt={timeFormat} />
                {teacher.phone && (
                  <>
                    <span>·</span>
                    <a
                      className="link"
                      href={`https://wa.me/${teacher.phone.replace(/[^0-9]/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                      title="Open WhatsApp"
                    >
                      WhatsApp {teacher.phone}
                    </a>
                  </>
                )}
                {teacher.joinedAt && <span>· joined {dateLabel(teacher.joinedAt.slice(0, 10))}</span>}
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href={`/admin/calendar?teacher=${teacher.externalId}`} className="btn btn-secondary btn-sm">
              <Icon name="calendar" size={14} /> Calendar
            </Link>
            <Link href="/admin/people" className="btn btn-secondary btn-sm">
              <Icon name="edit" size={14} /> Edit in People
            </Link>
          </div>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 16 }}>
        <Metric label="Assigned students" value={data.roster.length} />
        <Metric label="Upcoming lessons" value={stats.upcoming} />
        <Metric label="Completed lessons" value={stats.completed} />
        <Metric
          label="Awaiting homework review"
          value={stats.awaitingHomeworkReview}
          tone={stats.awaitingHomeworkReview > 0 ? "#92400E" : undefined}
        />
      </div>

      <div className="split-2-1" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", marginBottom: 14, flexWrap: "wrap" }}>
            <div className="h3">Teaching setup</div>
            <span className="body-sm" style={{ color: "var(--omnic-gray-500)" }}>Availability is academy time</span>
          </div>
          <div className="grid-3">
            <div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{availability.weeklyHours.toFixed(1)} h</div>
              <div className="body-sm">Open each week</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{data.recurringStudents}</div>
              <div className="body-sm">Recurring students</div>
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{teacher.meetLink ? "Ready" : "Missing"}</div>
              <div className="body-sm">Meeting room</div>
            </div>
          </div>
          <div className="body-sm" style={{ marginTop: 14, color: "var(--omnic-gray-600)" }}>
            {availability.activeDays.length > 0
              ? `Open ${availability.activeDays.map((day) => DAYS[day]).join(", ")} · ${availability.weeklySlots} time range${availability.weeklySlots === 1 ? "" : "s"}`
              : "No weekly availability has been opened yet."}
          </div>
          {teacher.meetLink ? (
            <a href={teacher.meetLink} target="_blank" rel="noreferrer" className="link body-sm" style={{ display: "inline-flex", gap: 5, alignItems: "center", marginTop: 10 }}>
              Open permanent meeting room <ExternalLink size={12} />
            </a>
          ) : (
            <div className="body-sm" style={{ marginTop: 10, color: "#92400E" }}>
              This teacher needs a permanent Google Meet link before new lessons can use it automatically.
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 20, background: "var(--brand-purple)", color: "#fff" }}>
          <div className="body-sm" style={{ color: "#fff", opacity: 0.82 }}>This month · provisional payable</div>
          <div style={{ fontSize: 30, fontWeight: 700, marginTop: 8 }}>
            {earnings?.monthEarningsUSD != null
              ? `$${earnings.monthEarningsUSD.toFixed(2)}`
              : `${earnings?.monthLessons ?? 0} lesson${earnings?.monthLessons === 1 ? "" : "s"}`}
          </div>
          <div className="body-sm" style={{ color: "#fff", opacity: 0.86, marginTop: 4 }}>
            {earnings?.monthLessons ?? 0} payable lesson{earnings?.monthLessons === 1 ? "" : "s"} · {ratePercent}% share
          </div>
          <div className="body-sm" style={{ color: "#fff", opacity: 0.72, marginTop: 14 }}>
            Completed lessons and charged student no-shows only. Unpaid ad-hoc lessons are excluded until settled.
          </div>
        </div>
      </div>

      <div className="split-2-1" style={{ marginBottom: 16 }}>
        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 12 }}>Assigned students</div>
          {data.roster.length === 0 ? (
            <div className="body-sm">No students assigned yet.</div>
          ) : (
            <div className="tbl-wrap">
              <table className="tbl">
                <thead><tr><th>Student</th><th>Lessons left</th><th>Next lesson</th><th>Status</th></tr></thead>
                <tbody>
                  {data.roster.map((student) => (
                    <tr key={student.externalId}>
                      <td>
                        <Link href={`/admin/students/${student.externalId}`} style={{ color: "var(--brand-purple)", fontWeight: 600 }}>
                          {student.name}
                        </Link>
                        <div className="body-sm">{student.email}</div>
                      </td>
                      <td style={{ fontWeight: 700, color: student.balance === 0 ? "var(--omnic-red)" : undefined }}>{student.balance}</td>
                      <td className="muted" style={{ whiteSpace: "nowrap" }}>
                        {student.nextLesson ? `${dateLabel(student.nextLesson.date)} · ${formatTime(student.nextLesson.startTime, timeFormat)}` : "—"}
                      </td>
                      <td><StatusPill status={student.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card" style={{ padding: 20 }}>
          <div className="h3" style={{ marginBottom: 12 }}>Reliability</div>
          <InfoRow label="Student no-shows" value={stats.studentNoShows} />
          <InfoRow label="Teacher no-shows" value={stats.teacherNoShows} tone={stats.teacherNoShows > 0 ? "#B91C1C" : undefined} />
          <InfoRow label="Teacher cancellations" value={stats.teacherCancellations} tone={stats.teacherCancellations > 0 ? "#92400E" : undefined} />
          <InfoRow label="All recorded sessions" value={stats.total} last />
        </div>
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 12 }}>Time off</div>
        {data.timeOff.length === 0 ? (
          <div className="body-sm">No upcoming time off.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {data.timeOff.map((timeOff) => (
              <div key={timeOff.groupId} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: 12, border: "1px solid var(--omnic-gray-100)", borderRadius: 8, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{dateLabel(timeOff.fromDate)} – {dateLabel(timeOff.toDate)}</div>
                  <div className="body-sm">{timeOff.days} day{timeOff.days === 1 ? "" : "s"} · already blocking availability</div>
                </div>
                {timeOff.approved ? (
                  <span className="pill pill-active"><Check size={12} /> Acknowledged</span>
                ) : timeOff.days > 3 ? (
                  <Button size="sm" onClick={() => void approve(timeOff.groupId)}>Acknowledge time off</Button>
                ) : (
                  <span className="pill pill-new">Academy notified</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div className="h3" style={{ marginBottom: 12 }}>Weekly availability</div>
        <AvailabilityBoard teacherId={teacher.externalId} teacherName={teacher.name} />
      </div>

      <div className="card" style={{ padding: 20 }}>
        <div className="h3" style={{ marginBottom: 12 }}>Recent sessions</div>
        {data.recentSessions.length === 0 ? (
          <div className="body-sm">No sessions yet.</div>
        ) : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Date</th><th>Student</th><th>Title</th><th>Status</th></tr></thead>
              <tbody>
                {data.recentSessions.map((session) => (
                  <tr key={session._id}>
                    <td style={{ whiteSpace: "nowrap" }}>{dateLabel(session.date)} · {formatTime(session.startTime, timeFormat)}</td>
                    <td>{session.studentName}</td>
                    <td>{session.title}</td>
                    <td><StatusPill status={session.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value, tone, last = false }: { label: string; value: string | number; tone?: string; last?: boolean }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "10px 0", borderBottom: last ? "none" : "1px solid var(--omnic-gray-100)" }}>
      <span className="body-sm">{label}</span>
      <strong style={{ color: tone }}>{value}</strong>
    </div>
  );
}
