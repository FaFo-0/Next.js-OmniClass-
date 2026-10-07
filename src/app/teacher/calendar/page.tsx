"use client";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { StaffCalendar } from "@/components/calendar/StaffCalendar";
import { CalendarSkeleton } from "@/components/calendar/calendarShared";
export default function TeacherCalendarPage() {
  const me = useQuery(api.users.getMe);
  return me ? (
    <StaffCalendar teacherId={me.externalId} />
  ) : (
    <CalendarSkeleton />
  );
}
