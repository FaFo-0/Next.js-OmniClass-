"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import {
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  ArrowUpDown,
  Eye,
  UserPlus,
} from "lucide-react";

type Role = "teacher" | "student" | "admin";

// Shape returned by Convex query
interface UserRow {
  _id: string;
  externalId: string;
  tokenIdentifier?: string;
  name: string;
  email: string;
  role: Role;
  teacherId?: string;
  createdAt: string;
}

const roleBadgeClass: Record<Role, string> = {
  teacher: "bg-blue-100 text-blue-700 hover:bg-blue-100",
  student: "bg-green-100 text-green-700 hover:bg-green-100",
  admin: "bg-purple-100 text-purple-700 hover:bg-purple-100",
};

export default function AdminUsersPage() {
  const t = useTranslations("admin.users");
  const tc = useTranslations("common");
  const tr = useTranslations("roles");
  const ts = useTranslations("status");
  const router = useRouter();
  const users = (useQuery(api.users.listUsers) ?? []) as UserRow[];
  const createUserMut = useMutation(api.users.createUser);
  const updateUserMut = useMutation(api.users.updateUser);
  const deleteUserMut = useMutation(api.users.deleteUser);
  // Auth is handled by Clerk — no manual user switching needed

  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // ── Add-user form state ──
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<Role>("student");
  const [newTeacherId, setNewTeacherId] = useState("");

  // ── Edit-row state ──
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editRole, setEditRole] = useState<Role>("student");
  const [editTeacherId, setEditTeacherId] = useState("");

  const teachers = useMemo(
    () => users.filter((u) => u.role === "teacher"),
    [users]
  );

  // ── Handlers ──

  async function handleCreate() {
    if (!newName.trim() || !newEmail.trim()) {
      toast.error(t("nameEmailRequired"));
      return;
    }
    const externalId = `${newRole}-${Date.now()}`;
    await createUserMut({
      externalId,
      name: newName.trim(),
      email: newEmail.trim(),
      role: newRole,
      teacherId: newRole === "student" ? newTeacherId || undefined : undefined,
    });
    toast.success(t("userAdded", { name: newName.trim(), role: tr(newRole) }));
    setNewName("");
    setNewEmail("");
    setNewRole("student");
    setNewTeacherId("");
    setShowAddForm(false);
  }

  function startEdit(user: UserRow) {
    setEditingId(user.externalId);
    setEditName(user.name);
    setEditEmail(user.email);
    setEditRole(user.role);
    setEditTeacherId(user.teacherId ?? "");
  }

  async function saveEdit(externalId: string) {
    if (!editName.trim() || !editEmail.trim()) {
      toast.error(t("nameEmailRequired"));
      return;
    }
    await updateUserMut({
      externalId,
      name: editName.trim(),
      email: editEmail.trim(),
      role: editRole,
      teacherId:
        editRole === "student" && editTeacherId ? editTeacherId : "",
    });
    setEditingId(null);
    toast.success(t("userUpdated"));
  }

  async function handleDelete(user: UserRow) {
    if (!confirm(t("confirmDelete", { name: user.name }))) return;
    await deleteUserMut({ externalId: user.externalId });
    toast.success(t("userDeleted", { name: user.name }));
  }

  function viewAsStudent(externalId: string) {
    router.push(`/teacher/students/${externalId}`);
  }

  // ── Columns ──

  const columns = useMemo<ColumnDef<UserRow>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 font-semibold"
            onClick={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          >
            {t("name")}
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        ),
        cell: ({ row }) => {
          if (editingId === row.original.externalId) {
            return (
              <Input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="h-8 w-40"
              />
            );
          }
          return <span className="font-medium">{row.original.name}</span>;
        },
      },
      {
        accessorKey: "email",
        header: t("email"),
        cell: ({ row }) => {
          if (editingId === row.original.externalId) {
            return (
              <Input
                value={editEmail}
                onChange={(e) => setEditEmail(e.target.value)}
                className="h-8 w-48"
              />
            );
          }
          return (
            <span className="text-muted-foreground">{row.original.email}</span>
          );
        },
      },
      {
        accessorKey: "role",
        header: ({ column }) => (
          <button
            className="flex items-center gap-1 font-semibold"
            onClick={() =>
              column.toggleSorting(column.getIsSorted() === "asc")
            }
          >
            {t("role")}
            <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground" />
          </button>
        ),
        cell: ({ row }) => {
          if (editingId === row.original.externalId) {
            return (
              <div className="flex gap-1">
                {(["teacher", "student", "admin"] as const).map((r) => (
                  <button
                    key={r}
                    onClick={() => setEditRole(r)}
                    className={`rounded-md px-2 py-0.5 text-xs font-medium capitalize transition-colors ${
                      editRole === r
                        ? roleBadgeClass[r]
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {tr(r)}
                  </button>
                ))}
              </div>
            );
          }
          return (
            <Badge variant="secondary" className={roleBadgeClass[row.original.role]}>
              {tr(row.original.role)}
            </Badge>
          );
        },
      },
      {
        id: "teacher",
        header: t("assignedTeacher"),
        cell: ({ row }) => {
          const user = row.original;
          if (editingId === user.externalId) {
            if (editRole !== "student") return <span className="text-muted-foreground">--</span>;
            return (
              <select
                value={editTeacherId}
                onChange={(e) => setEditTeacherId(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-sm"
              >
                <option value="">{tc("none")}</option>
                {teachers.map((teacher) => (
                  <option key={teacher.externalId} value={teacher.externalId}>
                    {teacher.name}
                  </option>
                ))}
              </select>
            );
          }
          if (user.role !== "student" || !user.teacherId)
            return <span className="text-muted-foreground">--</span>;
          const teacher = users.find((u) => u.externalId === user.teacherId);
          return <span>{teacher?.name ?? user.teacherId}</span>;
        },
      },
      {
        accessorKey: "createdAt",
        header: t("created"),
        cell: ({ row }) => {
          const d = new Date(row.original.createdAt);
          return (
            <span className="text-sm text-muted-foreground">
              {d.toLocaleDateString()}
            </span>
          );
        },
      },
      {
        id: "status",
        header: t("account"),
        cell: ({ row }) => {
          const linked = !!row.original.tokenIdentifier;
          return (
            <Badge
              variant="secondary"
              className={
                linked
                  ? "bg-green-100 text-green-700 hover:bg-green-100"
                  : "bg-amber-100 text-amber-700 hover:bg-amber-100"
              }
            >
              {linked ? ts("active") : ts("pendingInvite")}
            </Badge>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const user = row.original;

          if (editingId === user.externalId) {
            return (
              <div className="flex gap-2 justify-end">
                <Button
                  size="sm"
                  onClick={() => saveEdit(user.externalId)}
                >
                  <Check className="me-1 h-4 w-4" /> {tc("save")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setEditingId(null)}
                >
                  <X className="me-1 h-4 w-4" /> {tc("cancel")}
                </Button>
              </div>
            );
          }

          return (
            <div className="flex gap-1 justify-end">
              {user.role === "student" && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => viewAsStudent(user.externalId)}
                  title={t("viewAsStudent")}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => startEdit(user)}
                title={tc("edit")}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => handleDelete(user)}
                title={tc("delete")}
              >
                <Trash2 className="h-4 w-4 text-red-500" />
              </Button>
            </div>
          );
        },
      },
    ],
    [editingId, editName, editEmail, editRole, editTeacherId, teachers, users, t, tc, tr, ts]
  );

  // ── Table instance ──

  const table = useReactTable({
    data: users,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, _columnId, filterValue: string) => {
      const search = filterValue.toLowerCase();
      return (
        row.original.name.toLowerCase().includes(search) ||
        row.original.email.toLowerCase().includes(search)
      );
    },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  // ── Render ──

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("stats", {
              total: users.length,
              teachers: users.filter((u) => u.role === "teacher").length,
              students: users.filter((u) => u.role === "student").length,
            })}
          </p>
        </div>
        <Button
          onClick={() => setShowAddForm((v) => !v)}
          variant={showAddForm ? "secondary" : "default"}
        >
          {showAddForm ? (
            <>
              <X className="me-1.5 h-4 w-4" /> {tc("cancel")}
            </>
          ) : (
            <>
              <UserPlus className="me-1.5 h-4 w-4" /> {t("addUser")}
            </>
          )}
        </Button>
      </div>

      {/* ── Add User Form ── */}
      {showAddForm && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t("newUser")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                placeholder={t("fullName")}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <Input
                placeholder={t("emailAddress")}
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium">{t("role")}</span>
              {(["teacher", "student", "admin"] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setNewRole(r)}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                    newRole === r
                      ? roleBadgeClass[r]
                      : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  {tr(r)}
                </button>
              ))}
            </div>

            {newRole === "student" && (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium whitespace-nowrap">
                  {t("assignTeacher")}
                </span>
                <select
                  value={newTeacherId}
                  onChange={(e) => setNewTeacherId(e.target.value)}
                  className="h-9 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">{tc("none")}</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.externalId} value={teacher.externalId}>
                      {teacher.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex justify-end">
              <Button onClick={handleCreate}>
                <Plus className="me-1.5 h-4 w-4" /> {tc("create")}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Search ── */}
      <Input
        placeholder={t("searchPlaceholder")}
        value={globalFilter}
        onChange={(e) => setGlobalFilter(e.target.value)}
        className="max-w-sm"
      />

      {/* ── Table ── */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b bg-muted/40">
                {hg.headers.map((header) => (
                  <th
                    key={header.id}
                    className="px-4 py-3 text-start text-xs font-semibold uppercase tracking-wide text-muted-foreground"
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(
                          header.column.columnDef.header,
                          header.getContext()
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-8 text-center text-muted-foreground"
                >
                  {t("noUsers")}
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  className="border-b transition-colors hover:bg-muted/30"
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
