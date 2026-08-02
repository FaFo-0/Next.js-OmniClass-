"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { useState } from "react";
import { useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";
import { AvailabilityBoard } from "@/components/calendar/AvailabilityBoard";
import { AcademyTime, PersonTime } from "@/components/shared/PersonTime";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";

type TabKey = "students" | "instructors" | "admins";

export default function AdminPeoplePage() {
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("students");
  const allUsers = useQuery(api.users.listAllUsers) ?? [];
  const adminData = useQuery(api.users.listAdmins, {});
  const me = useQuery(api.users.getMe);
  const tenant = useQuery(api.tenantSettings.getActive, {});
  const payroll = useQuery(api.payroll.monthPayroll, {});
  const myTimeFormat = me?.timeFormat ?? "24h";
  const lessons = useQuery(api.lessons.listAllForAdmin, {}) ?? [];
  const updateUser = useMutation(api.users.updateUser);
  const assignTeacher = useMutation(api.users.assignTeacher);

  async function handleAssign(studentId: string, teacherId: string) {
    try {
      await assignTeacher({ studentId, teacherId });
      toast.success("Teacher assigned");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [vacancyTeacher, setVacancyTeacher] = useState<any>(null);
  const [showUnpaired, setShowUnpaired] = useState(false);

  // POLICY §6 — pause. Admins pause on a student's behalf; the cap is only
  // enforced on the student self-serve path, so this dialog is uncapped.
  const pauseStudent = useMutation(api.calendar.pauseStudent);
  const resumeStudent = useMutation(api.calendar.resumeStudent);
  const [pauseFor, setPauseFor] = useState<any>(null);
  const [pauseFrom, setPauseFrom] = useState("");
  const [pauseUntil, setPauseUntil] = useState("");
  const [pauseReason, setPauseReason] = useState("");
  const [pauseBusy, setPauseBusy] = useState(false);

  function openPause(s: any) {
    const today = new Date().toISOString().slice(0, 10);
    const in14 = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10);
    setPauseFor(s);
    setPauseFrom(today);
    setPauseUntil(in14);
    setPauseReason("");
  }

  async function submitPause() {
    if (!pauseFor || !pauseFrom || !pauseUntil) return;
    setPauseBusy(true);
    try {
      const r = await pauseStudent({
        studentId: pauseFor.externalId,
        fromDate: pauseFrom,
        untilDate: pauseUntil,
        reason: pauseReason || undefined,
      });
      toast.success(
        `Paused ${r.days} day${r.days === 1 ? "" : "s"}` +
          (r.grantsFrozen ? ` — expiry frozen on ${r.grantsFrozen} pack${r.grantsFrozen === 1 ? "" : "s"}` : "")
      );
      setPauseFor(null);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPauseBusy(false);
    }
  }

  async function doResume(s: any) {
    try {
      await resumeStudent({ studentId: s.externalId });
      toast.success(`${s.name} resumed`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  const allStudents = allUsers.filter((u: any) => u.role === "student");
  const students = showUnpaired
    ? allStudents.filter((u: any) => !u.teacherId)
    : allStudents;
  const instructors = allUsers.filter((u: any) => u.role === "teacher");
  const unpairedCount = allStudents.filter((u: any) => !u.teacherId).length;

  const lessonsByStudent = new Map<string, number>();
  for (const l of lessons) {
    if (!l.studentId) continue;
    lessonsByStudent.set(l.studentId, (lessonsByStudent.get(l.studentId) ?? 0) + 1);
  }
  const lessonsByTeacher = new Map<string, number>();
  for (const l of lessons) {
    if (!l.teacherId) continue;
    lessonsByTeacher.set(l.teacherId, (lessonsByTeacher.get(l.teacherId) ?? 0) + 1);
  }

  const teacherById = new Map<string, any>();
  for (const u of instructors) teacherById.set(u.externalId, u);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div><h1 className="h1" style={{ margin: 0 }}>People</h1></div>
        {/* Every lesson is stored in academy wall-clock, so that's the
            reference the columns below should be read against. */}
        <AcademyTime tz={tenant?.timezone} fmt={myTimeFormat} />
      </div>

      <div className="tabs">
        {([
          { value: "students", label: "Students", count: allStudents.length },
          { value: "instructors", label: "Instructors", count: instructors.length },
          { value: "admins", label: "Admins", count: adminData?.admins.length ?? 0 },
        ] as { value: TabKey; label: string; count: number }[]).map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`tab ${tab === t.value ? "tab-active" : ""}`}
          >
            {t.label}
            <span className="tab-count">{t.count}</span>
          </button>
        ))}
      </div>

      {tab === "students" && (
        <>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
            <div className="body-sm">
              {showUnpaired
                ? `${students.length} unpaired of ${allStudents.length}`
                : `${allStudents.length} total · ${unpairedCount} unpaired`}
            </div>
            <button
              className="chip"
              onClick={() => setShowUnpaired((v) => !v)}
              style={
                showUnpaired
                  ? {
                      background: "var(--brand-purple)",
                      color: "#FFFFFF",
                      borderColor: "var(--brand-purple)",
                      boxShadow: "0 2px 10px rgba(103,22,164,0.25)",
                    }
                  : {}
              }
            >
              <Icon name="users" size={12} /> Unpaired only
              {unpairedCount > 0 && (
                <span style={{ fontSize: 11, opacity: 0.85 }}>{unpairedCount}</span>
              )}
            </button>
          </div>
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Local time</th>
                <th>Status</th>
                {/* Lesson *records*, not the lesson balance — the teacher
                    detail page shows "lessons left" and the two must not read
                    as the same number. */}
                <th>Sessions</th>
                <th>Joined</th>
                <th>Teacher</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s: any) => {
                return (
                  // The whole row opens the student — clicking the name only
                  // was too small a target to find (FaFo, 2026-08-01). The
                  // controls inside stop the bubble so they still work.
                  <tr
                    key={s._id}
                    onClick={() => router.push(`/admin/students/${s.externalId}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="avatar avatar-sm">
                          {s.name?.split(" ").map((n: string) => n[0]).join("") ?? "?"}
                        </span>
                        <Link
                          href={`/admin/students/${s.externalId}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ fontWeight: 600, color: "var(--brand-purple)", whiteSpace: "nowrap" }}
                        >
                          {s.name}
                        </Link>
                      </div>
                    </td>
                    <td className="muted">{s.email}</td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <PersonTime tz={s.timezone} fmt={myTimeFormat} />
                    </td>
                    <td>
                      <StatusPill status={s.studentStatus ?? "active"} />
                      {s.studentStatus === "paused" && s.pausedUntil && (
                        <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                          until {s.pausedUntil}
                        </div>
                      )}
                    </td>
                    <td>{lessonsByStudent.get(s.externalId) ?? 0}</td>
                    <td className="muted">
                      {s._creationTime ? new Date(s._creationTime).toLocaleDateString() : "—"}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <Select
                        value={s.teacherId ?? ""}
                        onValueChange={(v) => handleAssign(s.externalId, v ?? "")}
                        items={[
                          { value: "", label: "— Unassigned —" },
                          ...instructors.map((t: any) => ({
                            value: t.externalId,
                            label: `${t.name}${t.ieltsCertified ? " · IELTS" : ""}`,
                          })),
                        ]}
                      >
                        <SelectTrigger style={{ height: 28, fontSize: 13 }}>
                          <SelectValue placeholder="Unassigned" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="">— Unassigned —</SelectItem>
                          {instructors.map((t: any) => (
                            <SelectItem key={t.externalId} value={t.externalId}>
                              {t.name}
                              {t.ieltsCertified ? " · IELTS" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td
                      style={{ display: "flex", gap: 4, whiteSpace: "nowrap" }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => { setSelectedUser(s); setEditOpen(true); }}
                      >
                        <Icon name="edit" size={12} /> Edit
                      </button>
                      {s.studentStatus === "paused" ? (
                        <button className="btn btn-ghost btn-sm" onClick={() => doResume(s)}>
                          Resume
                        </button>
                      ) : (
                        <button className="btn btn-ghost btn-sm" onClick={() => openPause(s)}>
                          Pause
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {students.length === 0 && (
                <tr>
                  <td colSpan={8} style={{ padding: 32, textAlign: "center" }} className="body-sm">
                    {showUnpaired ? "No unpaired students." : "No students yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        </>
      )}

      {tab === "instructors" && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Local time</th>
                <th>Students</th>
                <th>Sessions</th>
                <th>Owed</th>
                <th style={{ whiteSpace: "nowrap" }}>Meeting room</th>
                <th>Status</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {instructors.map((inst: any) => {
                const studentCount = students.filter(
                  (s: any) => s.teacherId === inst.externalId
                ).length;
                return (
                  <tr
                    key={inst._id}
                    onClick={() => router.push(`/admin/teachers/${inst.externalId}`)}
                    style={{ cursor: "pointer" }}
                  >
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="avatar avatar-sm">
                          {inst.name?.split(" ").map((n: string) => n[0]).join("") ?? "?"}
                        </span>
                        <div>
                          <Link
                            href={`/admin/teachers/${inst.externalId}`}
                            onClick={(e) => e.stopPropagation()}
                            style={{ fontWeight: 600, color: "var(--brand-purple)", whiteSpace: "nowrap" }}
                          >
                            {inst.name}
                          </Link>
                          <div className="muted" style={{ fontSize: 11 }}>
                            {inst.timezone ?? "no timezone"}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td
                      className="muted"
                      title={inst.email}
                      style={{
                        whiteSpace: "nowrap",
                        maxWidth: 150,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {inst.email}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      <PersonTime tz={inst.timezone} fmt={myTimeFormat} />
                    </td>
                    <td>{studentCount}</td>
                    <td>{lessonsByTeacher.get(inst.externalId) ?? 0}</td>
                    {/* What payroll owes them right now — the number the
                        Payroll tab would settle today. */}
                    <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>
                      {(() => {
                        const row = payroll?.rows.find(
                          (r: any) => r.teacherId === inst.externalId
                        );
                        if (!row) return <span className="muted">—</span>;
                        if (row.amountUnpaid <= 0) return <span className="muted">nothing due</span>;
                        return `${row.amountUnpaid.toLocaleString()} ${payroll!.currency}`;
                      })()}
                    </td>
                    {/* A teacher with no meeting room can't run a lesson — the
                        admin needs to see that without impersonating them. */}
                    <td onClick={(e) => e.stopPropagation()}>
                      {inst.meetLink ? (
                        <a
                          href={inst.meetLink}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "var(--brand-purple)" }}
                        >
                          Open
                        </a>
                      ) : (
                        <span style={{ color: "#92400E" }}>Not set</span>
                      )}
                    </td>
                    <td><span className="pill pill-active">Active</span></td>
                    <td className="muted" style={{ whiteSpace: "nowrap" }}>
                      {inst._creationTime ? new Date(inst._creationTime).toLocaleDateString() : "—"}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => { setVacancyTeacher(inst); }}
                        >
                          <Icon name="calendar" size={12} /> Availability
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => { setSelectedUser(inst); setEditOpen(true); }}
                        >
                          <Icon name="edit" size={12} /> Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {instructors.length === 0 && (
                <tr>
                  <td colSpan={10} style={{ padding: 32, textAlign: "center" }} className="body-sm">
                    No instructors yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Management: who runs the academy and what the system lets them do. */}
      {tab === "admins" && (
        <div className="tbl-wrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Local time</th>
                <th>Access</th>
                <th>Joined</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(adminData?.admins ?? []).map((a) => (
                <tr
                  key={a.externalId}
                  onClick={() => router.push(`/admin/staff/${a.externalId}`)}
                  style={{ cursor: "pointer" }}
                >
                  <td>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="avatar avatar-sm">
                        {a.name?.split(" ").map((n: string) => n[0]).join("") ?? "?"}
                      </span>
                      <div>
                        <Link
                          href={`/admin/staff/${a.externalId}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ fontWeight: 600, color: "var(--brand-purple)", whiteSpace: "nowrap" }}
                        >
                          {a.name}
                        </Link>
                        <div className="muted" style={{ fontSize: 11 }}>
                          {a.superadmin ? "Platform owner" : "Academy admin"}
                          {a.externalId === adminData?.viewerExternalId ? " · you" : ""}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="muted">{a.email}</td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>{a.phone ?? "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {(
                      <PersonTime
                        tz={a.timezone}
                        fmt={myTimeFormat}
                        possessive={a.externalId === adminData?.viewerExternalId ? "your" : "their"}
                        fixHref={a.externalId === adminData?.viewerExternalId ? "/admin/profile" : undefined}
                      />
                    )}
                  </td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>
                    {a.superadmin
                      ? "Everything"
                      : a.customPermissions
                        ? `${a.customPermissions.length} custom`
                        : "Admin defaults"}
                  </td>
                  <td className="muted" style={{ whiteSpace: "nowrap" }}>
                    {a.joinedAt ? new Date(a.joinedAt).toLocaleDateString() : "—"}
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <Link href={`/admin/staff/${a.externalId}`} className="btn btn-ghost btn-sm">
                      <Icon name="settings" size={12} /> Access
                    </Link>
                  </td>
                </tr>
              ))}
              {adminData && adminData.admins.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: "center" }} className="body-sm">
                    No admins yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}


      {vacancyTeacher && (
        <Dialog
          open={!!vacancyTeacher}
          onOpenChange={(o) => !o && setVacancyTeacher(null)}
        >
          <DialogContent style={{ maxWidth: 1100, width: "94vw", maxHeight: "90vh", overflowY: "auto" }}>
            <DialogHeader>
              <DialogTitle>
                Availability — {vacancyTeacher.name}
              </DialogTitle>
            </DialogHeader>
            <div style={{ marginTop: 12 }}>
              <AvailabilityBoard
                teacherId={vacancyTeacher.externalId}
                teacherName={vacancyTeacher.name}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}

      {pauseFor && (
        <Dialog open={!!pauseFor} onOpenChange={(o) => !o && setPauseFor(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Pause {pauseFor.name}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 mt-2">
              <p className="body-sm">
                Freezes the lesson-expiry clock and holds the weekly slot while
                skipping lessons in the window. The student auto-resumes at the
                end date. Policy: 14 days, twice per 6 months — admins may
                override.
              </p>
              <div className="flex gap-3">
                <div style={{ flex: 1 }}>
                  <label className="text-sm font-medium">From</label>
                  <Input type="date" value={pauseFrom} onChange={(e) => setPauseFrom(e.target.value)} />
                </div>
                <div style={{ flex: 1 }}>
                  <label className="text-sm font-medium">Until</label>
                  <Input type="date" value={pauseUntil} onChange={(e) => setPauseUntil(e.target.value)} />
                </div>
              </div>
              <div>
                <label className="text-sm font-medium">Reason (optional)</label>
                <Input value={pauseReason} onChange={(e) => setPauseReason(e.target.value)} placeholder="Travel, illness, exams…" />
              </div>
              <Button className="w-full" disabled={pauseBusy} onClick={submitPause}>
                {pauseBusy ? "Pausing…" : "Pause student"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {selectedUser && (
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit {selectedUser.name}</DialogTitle>
            </DialogHeader>
            <UserEditForm
              user={selectedUser}
              onClose={() => setEditOpen(false)}
              updateUser={updateUser}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "pill-active"
      : status === "trial"
        ? "pill-trial"
        : status === "paused"
          ? "pill-paused"
          : status === "cancelled"
            ? "pill-cancelled"
            : "pill-new";
  return <span className={`pill ${cls}`}>{status}</span>;
}

function UserEditForm({
  user,
  onClose,
  updateUser,
}: {
  user: any;
  onClose: () => void;
  updateUser: any;
}) {
  const [role, setRole] = useState(user.role);
  const [name, setName] = useState(user.name);
  const [status, setStatus] = useState(user.studentStatus ?? undefined);

  async function save() {
    try {
      await updateUser({
        externalId: user.externalId,
        role,
        name,
        studentStatus: status || undefined,
      });
      toast.success("User updated");
      onClose();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="space-y-3 mt-2">
      <div>
        <label className="text-sm font-medium">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div>
        <label className="text-sm font-medium">Role</label>
        <Select
          value={role}
          onValueChange={(v: string) => v && setRole(v)}
          items={{ admin: "Admin", teacher: "Teacher", student: "Student" }}
        >
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="teacher">Teacher</SelectItem>
            <SelectItem value="student">Student</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div>
        <label className="text-sm font-medium">Student status</label>
        <Select
          value={status ?? ""}
          onValueChange={(v: string) => v && setStatus(v || undefined)}
          items={{ active: "Active", trial: "Trial", paused: "Paused", cancelled: "Cancelled" }}
        >
          <SelectTrigger><SelectValue placeholder="Not applicable" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="trial">Trial</SelectItem>
            <SelectItem value="paused">Paused</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button onClick={save} className="w-full">Save changes</Button>
    </div>
  );
}
