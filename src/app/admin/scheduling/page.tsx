"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/shared/StatusPill";
import { toast } from "sonner";
import { Settings, AlertTriangle } from "lucide-react";
import Link from "next/link";

export default function AdminSchedulingPage() {
  const settings = useQuery(api.tenantSettings.getActive) ?? null;
  const unaccountedList = useQuery(api.schedule.listPendingUnaccounted) ?? [];
  const allUsers = useQuery(api.users.listUsers) ?? [];

  const updateSettings = useMutation(api.tenantSettings.update);
  const markNoShow = useMutation(api.schedule.markNoShow);

  const [editing, setEditing] = useState(false);
  const [maxReschedules, setMaxReschedules] = useState("");
  const [rescheduleWindow, setRescheduleWindow] = useState("");
  const [cancelWindow, setCancelWindow] = useState("");
  const [lessonDuration, setLessonDuration] = useState("");
  const [noShowConsumes, setNoShowConsumes] = useState(false);

  function startEdit() {
    if (!settings) return;
    setMaxReschedules(String(settings.maxReschedulesPerMonth ?? 4));
    setRescheduleWindow(String(settings.rescheduleWindowHours ?? 24));
    setCancelWindow(String(settings.cancelWindowHours ?? 12));
    setLessonDuration(String(settings.defaultLessonDurationMinutes ?? 60));
    setNoShowConsumes(settings.noShowConsumesLesson ?? true);
    setEditing(true);
  }

  async function saveSettings() {
    try {
      await updateSettings({
        patch: {
          maxReschedulesPerMonth: Number(maxReschedules) || 4,
          rescheduleWindowHours: Number(rescheduleWindow) || 24,
          cancelWindowHours: Number(cancelWindow) || 12,
          defaultLessonDurationMinutes: Number(lessonDuration) || 60,
          noShowConsumesLesson: noShowConsumes,
        },
      });
      toast.success("Settings saved");
      setEditing(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  function getUserName(id: string) {
    return allUsers.find((u) => u.externalId === id)?.name ?? id;
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <PageHeader
        title="Scheduling"
        subtitle="Manage scheduling policy and handle unaccounted sessions"
      />

      {/* Policy editor */}
      <div className="rounded-lg border bg-white p-5 mb-6"
        style={{ borderColor: "var(--omnic-gray-100)" }}>
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Settings size={16} /> Policy
          </h3>
          {!editing ? (
            <Button variant="outline" size="sm" onClick={startEdit}>
              Edit
            </Button>
          ) : (
            <Button size="sm" onClick={saveSettings}>
              Save
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <label className="text-zinc-500">Max reschedules/month</label>
            {editing ? (
              <Input
                type="number"
                value={maxReschedules}
                onChange={(e) => setMaxReschedules(e.target.value)}
              />
            ) : (
              <p className="font-medium">{settings?.maxReschedulesPerMonth ?? 4}</p>
            )}
          </div>
          <div>
            <label className="text-zinc-500">Reschedule window (hours)</label>
            {editing ? (
              <Input
                type="number"
                value={rescheduleWindow}
                onChange={(e) => setRescheduleWindow(e.target.value)}
              />
            ) : (
              <p className="font-medium">{settings?.rescheduleWindowHours ?? 24}h</p>
            )}
          </div>
          <div>
            <label className="text-zinc-500">Cancel window (hours)</label>
            {editing ? (
              <Input
                type="number"
                value={cancelWindow}
                onChange={(e) => setCancelWindow(e.target.value)}
              />
            ) : (
              <p className="font-medium">{settings?.cancelWindowHours ?? 12}h</p>
            )}
          </div>
          <div>
            <label className="text-zinc-500">Default lesson duration (min)</label>
            {editing ? (
              <Input
                type="number"
                value={lessonDuration}
                onChange={(e) => setLessonDuration(e.target.value)}
              />
            ) : (
              <p className="font-medium">{settings?.defaultLessonDurationMinutes ?? 60} min</p>
            )}
          </div>
          <div className="col-span-2">
            <label className="text-zinc-500">Student no-show consumes lesson?</label>
            {editing ? (
              <div className="mt-1">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={noShowConsumes}
                    onChange={(e) => setNoShowConsumes(e.target.checked)}
                  />
                  Yes, deduct from session package
                </label>
              </div>
            ) : (
              <p className="font-medium">{settings?.noShowConsumesLesson ? "Yes" : "No"}</p>
            )}
          </div>
        </div>
      </div>

      {/* Unaccounted sessions */}
      <div className="rounded-lg border bg-white p-5 mb-6"
        style={{ borderColor: "var(--omnic-gray-100)" }}>
        <h3 className="font-semibold flex items-center gap-2 mb-4">
          <AlertTriangle size={16} /> Unaccounted-for sessions
        </h3>
        {unaccountedList.length === 0 ? (
          <p className="text-sm text-zinc-500">No unaccounted sessions.</p>
        ) : (
          <div className="space-y-2">
            {unaccountedList.map((evt) => (
              <div
                key={evt._id}
                className="flex items-center justify-between rounded border p-3 text-sm"
                style={{ borderColor: "var(--omnic-gray-100)" }}
              >
                <div>
                  <span className="font-medium">{evt.title}</span>
                  <span className="ms-2 text-zinc-500">
                    {evt.date} {evt.startTime}
                  </span>
                  {evt.studentId && (
                    <span className="ms-2 text-zinc-400">
                      — {getUserName(evt.studentId)}
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      markNoShow({
                        eventId: evt._id,
                        party: "student",
                      }).then(() => toast.success("Marked student no-show"))
                    }
                  >
                    Student no-show
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      markNoShow({
                        eventId: evt._id,
                        party: "teacher",
                      }).then(() => toast.success("Teacher no-show + make-up credit"))
                    }
                  >
                    Teacher no-show
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4">
        <Link
          href="/admin/scheduling/requests"
          className="text-sm underline"
          style={{ color: "var(--brand-purple)" }}
        >
          View pending reschedule requests →
        </Link>
      </div>
    </div>
  );
}
