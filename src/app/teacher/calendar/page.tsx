"use client";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { StaffCalendar } from "@/components/calendar/StaffCalendar";
import { CalendarSkeleton } from "@/components/calendar/calendarShared";
export default function TeacherCalendarPage() {
  const me = useQuery(api.users.getMe);
  const availabilityHints = useQuery(api.onboarding.teacherStudentAvailabilityHints, {});
  return me ? (
    <>
      {availabilityHints && availabilityHints.length > 0 && (
        <div className="card" style={{ marginBottom: 16, padding: 16 }}>
          <div className="h3" style={{ marginBottom: 6 }}>Student availability hints</div>
          <div className="body-sm" style={{ marginBottom: 10 }}>
            Use these preferences as suggestions when opening slots; they do not restrict bookings.
          </div>
          {availabilityHints.map((hint) => (
            <div key={hint.studentId} className="body-sm" style={{ padding: "6px 0", borderTop: "1px solid var(--omnic-gray-100)" }}>
              <strong>{hint.name}</strong> · {hint.preferredDays.join(", ") || "Any day"} · {hint.preferredTimeOfDay.join(", ") || "Any time"}
            </div>
          ))}
        </div>
      )}
      <StaffCalendar teacherId={me.externalId} />
    </>
  ) : (
    <CalendarSkeleton />
  );
}
