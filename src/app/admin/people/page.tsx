"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import { Icon } from "@/components/shared/icons";
import { VacancyEditor } from "@/components/calendar/VacancyEditor";
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

type TabKey = "students" | "instructors" | "permissions";

export default function AdminPeoplePage() {
  const [tab, setTab] = useState<TabKey>("students");
  const allUsers = useQuery(api.users.listAllUsers) ?? [];
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
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div><h1 className="h1" style={{ margin: 0 }}>People</h1></div>
      </div>

      <div className="tabs">
        {([
          { value: "students", label: "Students", count: allStudents.length },
          { value: "instructors", label: "Instructors", count: instructors.length },
          { value: "permissions", label: "Permissions", count: 8 },
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
                <th>Status</th>
                <th>Lessons</th>
                <th>Last Activity</th>
                <th>Teacher</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {students.map((s: any) => {
                const teacher = s.teacherId ? teacherById.get(s.teacherId) : null;
                return (
                  <tr key={s._id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="avatar avatar-sm">
                          {s.name?.split(" ").map((n: string) => n[0]).join("") ?? "?"}
                        </span>
                        <span style={{ fontWeight: 600 }}>{s.name}</span>
                      </div>
                    </td>
                    <td className="muted">{s.email}</td>
                    <td><StatusPill status={s.studentStatus ?? "active"} /></td>
                    <td>{lessonsByStudent.get(s.externalId) ?? 0}</td>
                    <td className="muted">
                      {s._creationTime ? new Date(s._creationTime).toLocaleDateString() : "—"}
                    </td>
                    <td>
                      <Select
                        value={s.teacherId ?? ""}
                        onValueChange={(v) => handleAssign(s.externalId, v ?? "")}
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
                    <td>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => { setSelectedUser(s); setEditOpen(true); }}
                      >
                        <Icon name="edit" size={12} /> Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
              {students.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ padding: 32, textAlign: "center" }} className="body-sm">
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
                <th>Students</th>
                <th>Sessions</th>
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
                  <tr key={inst._id}>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span className="avatar avatar-sm">
                          {inst.name?.split(" ").map((n: string) => n[0]).join("") ?? "?"}
                        </span>
                        <span style={{ fontWeight: 600 }}>{inst.name}</span>
                      </div>
                    </td>
                    <td className="muted">{inst.email}</td>
                    <td>{studentCount}</td>
                    <td>{lessonsByTeacher.get(inst.externalId) ?? 0}</td>
                    <td><span className="pill pill-active">Active</span></td>
                    <td className="muted">
                      {inst._creationTime ? new Date(inst._creationTime).toLocaleDateString() : "—"}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => { setVacancyTeacher(inst); }}
                        >
                          <Icon name="calendar" size={12} /> Vacancies
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
                  <td colSpan={7} style={{ padding: 32, textAlign: "center" }} className="body-sm">
                    No instructors yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "permissions" && <PermissionsMatrix />}

      {vacancyTeacher && (
        <Dialog
          open={!!vacancyTeacher}
          onOpenChange={(o) => !o && setVacancyTeacher(null)}
        >
          <DialogContent style={{ maxWidth: 980, width: "92vw" }}>
            <DialogHeader>
              <DialogTitle>
                Vacancies — {vacancyTeacher.name}
              </DialogTitle>
            </DialogHeader>
            <div style={{ marginTop: 12 }}>
              <VacancyEditor teacherId={vacancyTeacher.externalId} />
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

function PermissionsMatrix() {
  const rows = [
    { key: "students", label: "Students", desc: "View and edit student records" },
    { key: "instructors", label: "Instructors", desc: "View and edit instructor records, assign students" },
    { key: "billing", label: "Billing", desc: "View invoices, subscriptions, payments" },
    { key: "ai", label: "AI Manager", desc: "Edit prompts, models, parameters" },
    { key: "branding", label: "Branding", desc: "Edit tenant identity and theming" },
    { key: "scheduling", label: "Scheduling", desc: "Edit reschedule/cancel windows" },
    { key: "impersonate", label: "Impersonate", desc: "Sign in as another user" },
    { key: "financials", label: "Financials", desc: "View P&L, revenue, expenses" },
  ];
  return (
    <div className="tbl-wrap">
      <table className="tbl">
        <thead>
          <tr>
            <th>Permission</th>
            <th>Description</th>
            <th>Admin</th>
            <th>Manager</th>
            <th>Sales</th>
            <th>Support</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.key}>
              <td style={{ fontWeight: 600 }}>{p.label}</td>
              <td className="muted">{p.desc}</td>
              <td><span className="pill pill-active">Full</span></td>
              <td><span className="pill pill-active">Granted</span></td>
              <td><span className="pill pill-new">—</span></td>
              <td><span className="pill pill-new">—</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
        <Select value={role} onValueChange={(v: string) => v && setRole(v)}>
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
        <Select value={status ?? ""} onValueChange={(v: string) => v && setStatus(v || undefined)}>
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
