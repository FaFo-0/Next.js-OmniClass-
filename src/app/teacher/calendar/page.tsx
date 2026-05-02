"use client";

import { useState, useMemo, useCallback } from "react";
import { useTranslations } from "next-intl";
import { addDays, format, parseISO } from "date-fns";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { WeeklyCalendar } from "@/components/calendar/WeeklyCalendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { X } from "lucide-react";

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

type FormMode = "create" | "edit";

interface FormState {
  mode: FormMode;
  eventId?: string; // Convex Id<"scheduleEvents"> stored as string for form state
  studentId: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
}

export default function TeacherCalendarPage() {
  const t = useTranslations("teacher.calendar");
  const tc = useTranslations("common");
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [form, setForm] = useState<FormState | null>(null);

  const { currentUserId } = useAuth();

  const events = useQuery(
    api.schedule.getEventsForTeacher,
    currentUserId ? { teacherId: currentUserId } : "skip"
  ) ?? [];
  const policy = useQuery(api.schedule.getPolicy) ?? {
    rescheduleWindowHours: 6,
    cancelWindowHours: 24,
    lessonDurationMinutes: 60,
  };
  const addEventMut = useMutation(api.schedule.addEvent);
  const updateEventMut = useMutation(api.schedule.updateEvent);
  const cancelEventMut = useMutation(api.schedule.cancelEvent);

  const allUsers = useQuery(api.users.listAllUsers);
  const students = useQuery(
    api.users.getStudentsForTeacher,
    currentUserId ? { teacherId: currentUserId } : "skip"
  );

  const handlePrevWeek = useCallback(
    () => setCurrentDate((d) => addDays(d, -7)),
    []
  );
  const handleNextWeek = useCallback(
    () => setCurrentDate((d) => addDays(d, 7)),
    []
  );
  const handleToday = useCallback(() => setCurrentDate(new Date()), []);

  function computeEndTime(startTime: string): string {
    const [h, m] = startTime.split(":").map(Number);
    const totalMinutes = h * 60 + m + policy.lessonDurationMinutes;
    const endH = Math.floor(totalMinutes / 60);
    const endM = totalMinutes % 60;
    return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
  }

  function handleSlotClick(date: string, time: string) {
    setForm({
      mode: "create",
      studentId: students?.[0]?.externalId ?? "",
      title: t("defaultTitle"),
      date,
      startTime: time,
      endTime: computeEndTime(time),
    });
  }

  function handleEventClick(event: ScheduleEvent) {
    setForm({
      mode: "edit",
      eventId: event._id,
      studentId: event.studentId,
      title: event.title,
      date: event.date,
      startTime: event.startTime,
      endTime: event.endTime,
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !currentUserId) return;

    if (form.mode === "create") {
      addEventMut({
        teacherId: currentUserId,
        studentId: form.studentId,
        title: form.title,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        status: "scheduled",
        createdAt: new Date().toISOString(),
      });
    } else if (form.mode === "edit" && form.eventId) {
      updateEventMut({
        id: form.eventId as any,
        title: form.title,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
      });
    }

    setForm(null);
  }

  function handleCancel() {
    if (form?.mode === "edit" && form.eventId) {
      cancelEventMut({ id: form.eventId as any });
      setForm(null);
    }
  }

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
            onSlotClick={handleSlotClick}
            onEventClick={handleEventClick}
          />
        </div>

        {/* Side panel — form */}
        {form && (
          <Card className="w-full shrink-0 self-start lg:w-80">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  {form.mode === "create" ? t("newLesson") : t("editLesson")}
                </h3>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => setForm(null)}
                >
                  <X className="size-4" />
                </Button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Student */}
                <div className="space-y-1">
                  <label
                    htmlFor="student"
                    className="text-sm font-medium text-foreground"
                  >
                    {t("student")}
                  </label>
                  <select
                    id="student"
                    value={form.studentId}
                    onChange={(e) =>
                      setForm((f) =>
                        f ? { ...f, studentId: e.target.value } : f
                      )
                    }
                    className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    disabled={form.mode === "edit"}
                  >
                    {(!students || students.length === 0) && (
                      <option value="">{t("noStudents")}</option>
                    )}
                    {(students ?? []).map((s) => (
                      <option key={s.externalId} value={s.externalId}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Title */}
                <div className="space-y-1">
                  <label
                    htmlFor="title"
                    className="text-sm font-medium text-foreground"
                  >
                    {t("lessonTitle")}
                  </label>
                  <Input
                    id="title"
                    value={form.title}
                    onChange={(e) =>
                      setForm((f) =>
                        f ? { ...f, title: e.target.value } : f
                      )
                    }
                  />
                </div>

                {/* Date */}
                <div className="space-y-1">
                  <label
                    htmlFor="date"
                    className="text-sm font-medium text-foreground"
                  >
                    {t("date")}
                  </label>
                  <Input
                    id="date"
                    type="date"
                    value={form.date}
                    onChange={(e) =>
                      setForm((f) =>
                        f ? { ...f, date: e.target.value } : f
                      )
                    }
                  />
                </div>

                {/* Time */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label
                      htmlFor="startTime"
                      className="text-sm font-medium text-foreground"
                    >
                      {t("start")}
                    </label>
                    <Input
                      id="startTime"
                      type="time"
                      value={form.startTime}
                      onChange={(e) =>
                        setForm((f) =>
                          f
                            ? {
                                ...f,
                                startTime: e.target.value,
                                endTime: computeEndTime(e.target.value),
                              }
                            : f
                        )
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <label
                      htmlFor="endTime"
                      className="text-sm font-medium text-foreground"
                    >
                      {t("end")}
                    </label>
                    <Input
                      id="endTime"
                      type="time"
                      value={form.endTime}
                      onChange={(e) =>
                        setForm((f) =>
                          f ? { ...f, endTime: e.target.value } : f
                        )
                      }
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                  <Button type="submit" className="flex-1">
                    {form.mode === "create" ? t("createLesson") : tc("save")}
                  </Button>
                  {form.mode === "edit" && (
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={handleCancel}
                    >
                      {t("cancelLesson")}
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
