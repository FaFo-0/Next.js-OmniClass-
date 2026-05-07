"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { UserPlus, Search } from "lucide-react";

export default function PeoplePage() {
  const allUsers = useQuery(api.users.listUsers) ?? [];
  const updateUser = useMutation(api.users.updateUser);

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [selectedUser, setSelectedUser] = useState<any>(null);
  const [editOpen, setEditOpen] = useState(false);

  const filtered = allUsers.filter((u) => {
    if (roleFilter !== "all" && u.role !== roleFilter) return false;
    if (search && !u.name.toLowerCase().includes(search.toLowerCase()) && !u.email.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="p-6">
      <PageHeader title="People" subtitle={`${allUsers.length} users in this organization`} />

      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <Input
            placeholder="Search…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="ps-9"
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => setRoleFilter(v ?? "all")}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="admin">Admin</SelectItem>
            <SelectItem value="teacher">Teacher</SelectItem>
            <SelectItem value="student">Student</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: "var(--omnic-gray-100)" }}>
        <table className="w-full text-sm">
          <thead style={{ background: "var(--omnic-gray-50)" }}>
            <tr className="border-b" style={{ borderColor: "var(--omnic-gray-100)" }}>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Name</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Email</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Role</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Status</th>
              <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Locale</th>
              <th className="text-right px-4 py-2.5 font-medium text-zinc-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((user) => (
              <tr key={user._id} className="border-b hover:bg-zinc-50/50" style={{ borderColor: "var(--omnic-gray-100)" }}>
                <td className="px-4 py-2.5 font-medium">{user.name}</td>
                <td className="px-4 py-2.5 text-zinc-500">{user.email}</td>
                <td className="px-4 py-2.5"><StatusPill status={user.role} /></td>
                <td className="px-4 py-2.5">
                  {user.studentStatus ? <StatusPill status={user.studentStatus} /> : <span className="text-zinc-400">—</span>}
                </td>
                <td className="px-4 py-2.5 text-xs text-zinc-500">{user.locale ?? "en"}</td>
                <td className="px-4 py-2.5 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => { setSelectedUser(user); setEditOpen(true); }}
                  >
                    Edit
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
        <Select value={role} onValueChange={(v) => v && setRole(v)}>
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
