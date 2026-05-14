"use client";

// H.9 — Student booking page.
// Activity tiles → (1on1/IELTS) assigned-teacher slot grid OR (group)
// open-enrollment event list. Slot click → confirm modal → spend +
// insert scheduleEvents. Failure surfaces via Convex error.

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/shared/icons";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

type Activity = {
  id: string;
  name: string;
  pointCost: number;
  recordRequired: boolean;
  isGroup: boolean;
  allowedRoles: string[];
  isActive: boolean;
  sortOrder: number;
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function StudentBookPage() {
  const { user } = useAuth();
  const tenant = useQuery(api.tenantSettings.getActive, {});
  const balance = useQuery(api.points.getBalance, {});
  const teachers = useQuery(api.users.listAllUsers) ?? [];
  const bookSlot = useMutation(api.schedule.bookSlot);

  const activities: Activity[] = (tenant?.activityTypes ?? []).filter(
    (a) => a.isActive
  );

  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(
    null
  );

  const assignedTeacher = useMemo(
    () => teachers.find((t: any) => t.externalId === user?.teacherId),
    [teachers, user?.teacherId]
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Book a session</h1>
          <div className="body" style={{ marginTop: 4 }}>
            {balance ? (
              <>
                You have <strong>{balance.balance} points</strong>
                {balance.nextExpiresAt && (
                  <> · earliest expiry {balance.nextExpiresAt}</>
                )}
              </>
            ) : (
              "Loading balance…"
            )}
          </div>
        </div>
      </div>

      {/* Activity tiles */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        {activities.map((a) => {
          const isSelected = selectedActivity?.id === a.id;
          return (
            <button
              key={a.id}
              onClick={() => setSelectedActivity(a)}
              className="card"
              style={{
                padding: 20,
                textAlign: "left",
                cursor: "pointer",
                border: isSelected
                  ? "2px solid var(--omnic-tenant-primary)"
                  : "1px solid rgba(103,22,164,0.06)",
                background: "var(--card-bg)",
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 6, color: "var(--omnic-gray-900)" }}>
                {a.name}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: "var(--omnic-tenant-primary)" }}>
                {a.pointCost} pts
              </div>
              <div className="body-sm" style={{ marginTop: 6 }}>
                {a.isGroup ? "Open enrollment" : "1-on-1 w/ your teacher"}
              </div>
            </button>
          );
        })}
      </div>

      {selectedActivity && !selectedActivity.isGroup && (
        <OneOnOneBooking
          activity={selectedActivity}
          balance={balance?.balance ?? 0}
          teacher={assignedTeacher}
          onBook={async (slot) => {
            try {
              await bookSlot({
                activityTypeId: selectedActivity.id,
                date: slot.date,
                startTime: slot.startTime,
                endTime: slot.endTime,
              });
              toast.success(
                `Booked ${selectedActivity.name} on ${slot.date} ${slot.startTime}`
              );
            } catch (e) {
              toast.error((e as Error).message);
            }
          }}
        />
      )}

      {selectedActivity && selectedActivity.isGroup && (
        <GroupBooking activity={selectedActivity} />
      )}

      {!selectedActivity && (
        <div className="card" style={{ padding: 40, textAlign: "center" }}>
          <Icon name="calendar" size={36} stroke="var(--omnic-gray-300)" />
          <div className="body" style={{ marginTop: 8 }}>
            Pick an activity above to see available slots.
          </div>
        </div>
      )}
    </div>
  );
}

function OneOnOneBooking({
  activity,
  balance,
  teacher,
  onBook,
}: {
  activity: Activity;
  balance: number;
  teacher: any;
  onBook: (slot: { date: string; startTime: string; endTime: string }) => Promise<void>;
}) {
  const fromDate = new Date().toISOString().slice(0, 10);
  const toDate = new Date(Date.now() + 27 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const slots = useQuery(
    api.vacancies.getBookableSlots,
    teacher
      ? {
          teacherId: teacher.externalId,
          fromDate,
          toDate,
        }
      : "skip"
  );

  const [confirmSlot, setConfirmSlot] = useState<any | null>(null);

  if (!teacher) {
    return (
      <div className="card" style={{ padding: 24 }}>
        <div className="h3" style={{ marginBottom: 8 }}>
          No teacher assigned yet
        </div>
        <div className="body">
          Ask your admin to pair you with a teacher. Once paired, your
          teacher&apos;s vacancies show here as bookable slots.
        </div>
      </div>
    );
  }

  // Group by date for a tidy list.
  const byDate = new Map<string, any[]>();
  for (const s of slots ?? []) {
    const arr = byDate.get(s.date) ?? [];
    arr.push(s);
    byDate.set(s.date, arr);
  }
  const dates = Array.from(byDate.keys()).sort();

  return (
    <div>
      <div className="card" style={{ padding: 16, marginBottom: 16, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <span className="avatar">
          {teacher.name?.split(" ").map((n: string) => n[0]).join("") ?? "?"}
        </span>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div className="h3" style={{ marginBottom: 2 }}>{teacher.name}</div>
          <div className="body-sm">Your assigned teacher</div>
        </div>
        {teacher.phoneWhatsapp && (
          <a
            className="btn btn-secondary btn-sm"
            href={`https://wa.me/${teacher.phoneWhatsapp.replace(/[^\d]/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Icon name="external" size={13} /> Contact on WhatsApp
          </a>
        )}
      </div>

      {slots === undefined && (
        <div className="card" style={{ padding: 32, textAlign: "center" }}>
          <div className="body-sm">Loading slots…</div>
        </div>
      )}
      {slots !== undefined && dates.length === 0 && (
        <div className="card" style={{ padding: 32, textAlign: "center" }}>
          <div className="body">
            Your teacher hasn&apos;t set vacancies yet.
            {teacher.phoneWhatsapp && (
              <> Reach out on WhatsApp to coordinate.</>
            )}
          </div>
        </div>
      )}

      {dates.map((date) => {
        const day = new Date(date).getDay();
        return (
          <div key={date} className="card" style={{ padding: 16, marginBottom: 12 }}>
            <div className="h3" style={{ marginBottom: 10 }}>
              {DAYS[day]} · {date}
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {byDate.get(date)!.map((s, idx) => (
                <button
                  key={`${date}-${s.startTime}-${idx}`}
                  className="chip"
                  disabled={s.isBooked}
                  onClick={() => setConfirmSlot(s)}
                  style={{
                    opacity: s.isBooked ? 0.4 : 1,
                    cursor: s.isBooked ? "not-allowed" : "pointer",
                    background: s.isBooked
                      ? "var(--omnic-gray-100)"
                      : "white",
                  }}
                >
                  {s.startTime}
                </button>
              ))}
            </div>
          </div>
        );
      })}

      <Dialog open={!!confirmSlot} onOpenChange={(o) => !o && setConfirmSlot(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm booking</DialogTitle>
          </DialogHeader>
          {confirmSlot && (
            <div className="space-y-3 mt-2">
              <p className="body">
                <strong>{activity.name}</strong> with {teacher.name}
              </p>
              <p className="body">
                {confirmSlot.date} · {confirmSlot.startTime} — {confirmSlot.endTime}
              </p>
              <div
                className="body-sm"
                style={{
                  padding: 10,
                  background: "var(--omnic-gray-50)",
                  borderRadius: 8,
                }}
              >
                Cost: <strong>{activity.pointCost} pts</strong> · Balance after:{" "}
                <strong>{balance - activity.pointCost}</strong>
              </div>
              <Button
                className="w-full"
                disabled={balance < activity.pointCost}
                onClick={async () => {
                  await onBook(confirmSlot);
                  setConfirmSlot(null);
                }}
              >
                {balance < activity.pointCost
                  ? `Need ${activity.pointCost - balance} more points`
                  : "Confirm booking"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GroupBooking({ activity }: { activity: Activity }) {
  const events = useQuery(api.schedule.listForOrg, {}) ?? [];
  const myEnrollments = useQuery(api.enrollments.listForStudent, {}) ?? [];
  const enroll = useMutation(api.enrollments.enroll);
  const unenroll = useMutation(api.enrollments.unenroll);

  const today = new Date().toISOString().slice(0, 10);
  const groupEvents = events.filter(
    (e: any) =>
      e.activityTypeId === activity.id &&
      e.date >= today &&
      e.status === "scheduled" &&
      !e.isDeleted
  );

  const enrollMap = new Map<string, any>();
  for (const en of myEnrollments) enrollMap.set(en.eventId, en);

  if (groupEvents.length === 0) {
    return (
      <div className="card" style={{ padding: 32, textAlign: "center" }}>
        <Icon name="users" size={36} stroke="var(--omnic-gray-300)" />
        <div className="body" style={{ marginTop: 8 }}>
          No upcoming {activity.name.toLowerCase()} sessions. Check back soon.
        </div>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      {groupEvents.map((e: any) => {
        const myEn = enrollMap.get(e._id);
        const enrolled =
          myEn?.status === "enrolled" || myEn?.status === "attended";
        return (
          <div key={e._id} className="lesson-row">
            <div style={{ width: 40, height: 40, borderRadius: 8, background: "var(--omnic-tenant-primary-soft)", color: "var(--omnic-tenant-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icon name="users" size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{e.title}</div>
              <div className="body-sm">
                {e.date} · {e.startTime} — {e.endTime}
              </div>
            </div>
            <span className="pill pill-tenant">{activity.pointCost} pts</span>
            {enrolled ? (
              <button
                className="btn btn-secondary btn-sm"
                onClick={async () => {
                  try {
                    await unenroll({ enrollmentId: myEn._id });
                    toast.success("Unenrolled · points refunded");
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              >
                Leave
              </button>
            ) : (
              <button
                className="btn btn-tenant btn-sm"
                onClick={async () => {
                  try {
                    await enroll({ eventId: e._id });
                    toast.success("Enrolled");
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              >
                Join
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}
