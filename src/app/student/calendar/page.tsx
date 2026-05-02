"use client";

import { useState, useMemo, useCallback } from "react";
import { addDays, format, parseISO, differenceInHours } from "date-fns";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { useTranslations } from "next-intl";
import { WeeklyCalendar } from "@/components/calendar/WeeklyCalendar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { X, Clock, CalendarDays, AlertTriangle } from "lucide-react";

interface ScheduleEvent {
  _id: string;
  teacherId: string;
  studentId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  status: "scheduled" | "completed" | "cancelled" | "rescheduled";
  createdAt: string;
}

export default function StudentCalendarPage() {
  const t = useTranslations("student.calendar");
  const tStatus = useTranslations("status");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedEvent, setSelectedEvent] = useState<ScheduleEvent | null>(
    null
  );

  const { currentUserId } = useAuth();

  const events = useQuery(
    api.schedule.getEventsForStudent,
    currentUserId ? { studentId: currentUserId } : "skip"
  ) ?? [];
  const policy = useQuery(api.schedule.getPolicy) ?? {
    rescheduleWindowHours: 6,
    cancelWindowHours: 24,
    lessonDurationMinutes: 60,
  };
  const cancelEventMut = useMutation(api.schedule.cancelEvent);

  const allUsers = useQuery(api.users.listAllUsers);

  const handlePrevWeek = useCallback(
    () => setCurrentDate((d) => addDays(d, -7)),
    []
  );
  const handleNextWeek = useCallback(
    () => setCurrentDate((d) => addDays(d, 7)),
    []
  );
  const handleToday = useCallback(() => setCurrentDate(new Date()), []);

  function handleEventClick(event: ScheduleEvent) {
    setSelectedEvent(event);
  }

  function getHoursUntilEvent(event: ScheduleEvent): number {
    const eventDatetime = parseISO(`${event.date}T${event.startTime}:00`);
    return differenceInHours(eventDatetime, new Date());
  }

  function canCancelEvent(event: ScheduleEvent): boolean {
    if (event.status !== "scheduled") return false;
    return getHoursUntilEvent(event) >= policy.cancelWindowHours;
  }

  function handleCancelEvent() {
    if (!selectedEvent) return;
    cancelEventMut({ id: selectedEvent._id as any });
    // Update local state to reflect the change
    setSelectedEvent((prev) =>
      prev ? { ...prev, status: "cancelled" } : null
    );
  }

  const teacher = useMemo(() => {
    if (!selectedEvent) return null;
    return (allUsers ?? []).find((u) => u.externalId === selectedEvent.teacherId);
  }, [selectedEvent, allUsers]);

  const statusLabel: Record<ScheduleEvent["status"], string> = {
    scheduled: tStatus("scheduled"),
    completed: tStatus("completed"),
    cancelled: tStatus("cancelled"),
    rescheduled: tStatus("rescheduled"),
  };

  const statusVariant: Record<
    ScheduleEvent["status"],
    "default" | "secondary" | "outline" | "destructive"
  > = {
    scheduled: "default",
    completed: "secondary",
    cancelled: "destructive",
    rescheduled: "outline",
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-muted-foreground">
          {t("subtitle")}
        </p>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        {/* Calendar */}
        <div className="min-w-0 flex-1">
          <WeeklyCalendar
            events={events}
            users={allUsers ?? []}
            currentDate={currentDate}
            onPrevWeek={handlePrevWeek}
            onNextWeek={handleNextWeek}
            onToday={handleToday}
            onEventClick={handleEventClick}
            readOnly
          />
        </div>

        {/* Side panel — event details */}
        {selectedEvent && (
          <Card className="w-full shrink-0 self-start lg:w-80">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">{t("lessonDetails")}</h3>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setSelectedEvent(null)}
                >
                  <X className="size-4" />
                </Button>
              </div>

              {/* Title & Status */}
              <div className="space-y-2">
                <p className="text-lg font-medium">{selectedEvent.title}</p>
                <Badge variant={statusVariant[selectedEvent.status]}>
                  {statusLabel[selectedEvent.status]}
                </Badge>
              </div>

              {/* Details */}
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <CalendarDays className="size-4 shrink-0" />
                  <span>
                    {format(parseISO(selectedEvent.date), "EEEE, MMMM d, yyyy")}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="size-4 shrink-0" />
                  <span>
                    {selectedEvent.startTime} - {selectedEvent.endTime}
                  </span>
                </div>
                {teacher && (
                  <div className="text-muted-foreground">
                    Teacher: <span className="text-foreground">{teacher.name}</span>
                  </div>
                )}
              </div>

              {/* Cancel action */}
              {selectedEvent.status === "scheduled" && (
                <div className="border-t border-border pt-4">
                  {canCancelEvent(selectedEvent) ? (
                    <Button
                      variant="destructive"
                      className="w-full"
                      onClick={handleCancelEvent}
                    >
                      {t("cancelLesson")}
                    </Button>
                  ) : (
                    <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                      <span>
                        {t("cannotCancel", { hours: policy.cancelWindowHours })}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {selectedEvent.status === "cancelled" && (
                <div className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
                  {t("alreadyCancelled")}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
