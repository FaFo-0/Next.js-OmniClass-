"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { PageHeader } from "@/components/shared/PageHeader";
import { WeeklyCalendar } from "@/components/calendar/WeeklyCalendar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { RefreshCw, Send } from "lucide-react";
import { addWeeks } from "date-fns";

export default function TeacherCalendarPage() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<any>(null);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [reason, setReason] = useState("");

  const events = useQuery(api.schedule.listForTeacher, {}) ?? [];
  const me = useQuery(api.users.getMe);
  const allUsers = useQuery(api.users.listAllUsers) ?? [];

  const requestReschedule = useMutation(api.schedule.requestReschedule);
  const updateEvent = useMutation(api.schedule.updateEvent);

  const hasFullEdit = () => {
    if (!me) return false;
    const perms = me.permissions ?? [];
    if (perms.includes("calendar.edit.full")) return true;
    return me.role === "admin";
  };

  function openReschedule(event: any) {
    setSelectedEvent(event);
    setNewDate(event.date);
    setNewTime(event.startTime);
    setReason("");
    setRescheduleOpen(true);
  }

  async function submitReschedule() {
    if (!selectedEvent) return;

    if (hasFullEdit()) {
      try {
        await updateEvent({
          eventId: selectedEvent._id as Id<"scheduleEvents">,
          date: newDate,
          startTime: newTime,
        });
        toast.success("Event rescheduled");
        setRescheduleOpen(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    } else {
      try {
        await requestReschedule({
          eventId: selectedEvent._id as Id<"scheduleEvents">,
          toDate: newDate,
          toStartTime: newTime,
          reason: reason || undefined,
        });
        toast.success("Reschedule request submitted to admin");
        setRescheduleOpen(false);
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
  }

  const title = hasFullEdit() ? "Edit event" : "Request reschedule";
  const submitLabel = hasFullEdit() ? "Reschedule" : "Send request";

  return (
    <div className="p-6">
      <PageHeader
        title="My Calendar"
        subtitle={
          hasFullEdit()
            ? "Full edit — drag to reschedule"
            : "Request-only — submit changes for admin approval"
        }
      />

      <WeeklyCalendar
        events={events.map((e) => ({ ...e, _id: e._id as string }))}
        users={allUsers.map((u) => ({
          externalId: u.externalId,
          name: u.name,
        }))}
        currentDate={currentDate}
        onPrevWeek={() => setCurrentDate((d) => addWeeks(d, -1))}
        onNextWeek={() => setCurrentDate((d) => addWeeks(d, 1))}
        onToday={() => setCurrentDate(new Date())}
        onEventClick={openReschedule}
        readOnly={false}
      />

      <Dialog open={rescheduleOpen} onOpenChange={setRescheduleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            {selectedEvent && (
              <p className="text-sm text-zinc-500">
                From: {selectedEvent.date} at {selectedEvent.startTime}
              </p>
            )}
            <div>
              <label className="text-sm font-medium">New date</label>
              <Input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">New time</label>
              <Input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
              />
            </div>
            {!hasFullEdit() && (
              <div>
                <label className="text-sm font-medium">Reason (optional)</label>
                <Textarea
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            )}
            <Button className="w-full" onClick={submitReschedule}>
              {hasFullEdit() ? (
                <RefreshCw size={14} className="me-1" />
              ) : (
                <Send size={14} className="me-1" />
              )}
              {submitLabel}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
