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
import { Check, X, Shield } from "lucide-react";

const ALL_PERMISSIONS = [
  "lessons.create", "lessons.edit", "lessons.view.own", "lessons.view.any",
  "lessons.delete", "lessons.restore", "lessons.mark_no_show", "lessons.flag_teacher_miss",
  "users.create", "users.edit", "users.view.any", "users.delete",
  "users.assign_self_students", "users.create_students",
  "billing.view", "billing.edit",
  "ai.configure", "achievements.edit", "schedule.manage", "scheduling.edit",
  "branding.edit", "certificates.issue", "impersonate",
  "calendar.edit.full", "calendar.edit.request_only",
  "calendar.cancel.full", "calendar.cancel.request_only", "calendar.delete.full",
  "library.upload", "library.view", "library.send_word_to_student",
];

const ROLE_DEFAULTS: Record<string, string[]> = {
  admin: ALL_PERMISSIONS, // admins get everything
  teacher: [
    "lessons.create", "lessons.edit", "lessons.view.any", "lessons.mark_no_show",
    "users.view.any", "calendar.edit.full", "calendar.cancel.full",
    "library.view", "library.send_word_to_student",
  ],
  student: ["lessons.view.own", "library.view"],
};

export default function AdminPermissionsPage() {
  const allUsers = useQuery(api.users.listUsers) ?? [];
  const pendingReqs = useQuery(api.permissions.listPendingPermissionRequests) ?? [];
  const resolvePermission = useMutation(api.permissions.resolvePermission);
  const [search, setSearch] = useState("");

  const filtered = search
    ? allUsers.filter((u) =>
        u.name.toLowerCase().includes(search.toLowerCase()) ||
        u.email.toLowerCase().includes(search.toLowerCase())
      )
    : allUsers;

  function hasPermission(user: { role: string; permissions?: string[] }, perm: string) {
    if (user.permissions && user.permissions.length > 0) {
      return user.permissions.includes(perm);
    }
    return (ROLE_DEFAULTS[user.role] ?? []).includes(perm);
  }

  function getUserName(id: string) {
    return allUsers.find((u) => u.externalId === id)?.name ?? id;
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Permissions"
        subtitle="Per-role defaults and per-user overrides"
      />

      {/* Pending permission requests */}
      {pendingReqs.length > 0 && (
        <div className="mb-6 rounded-lg border bg-amber-50/50 p-4"
          style={{ borderColor: "var(--brand-yellow-soft)" }}>
          <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
            <Shield size={14} /> Pending permission requests
          </h3>
          <div className="space-y-2">
            {pendingReqs.map((req) => (
              <div
                key={req._id}
                className="flex items-center justify-between text-sm"
              >
                <span>
                  <span className="font-medium">{getUserName(req.teacherId)}</span>
                  <span className="text-zinc-500"> requests </span>
                  <code className="bg-zinc-100 px-1 rounded text-xs">{req.action}</code>
                </span>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      resolvePermission({
                        requestId: req._id,
                        status: "approved",
                      }).then(() => toast.success("Approved"))
                    }
                  >
                    <Check size={12} className="me-1" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      resolvePermission({
                        requestId: req._id,
                        status: "rejected",
                      }).then(() => toast.success("Rejected"))
                    }
                  >
                    <X size={12} className="me-1" /> Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Role defaults */}
      <div className="mb-8 rounded-lg border bg-white p-5"
        style={{ borderColor: "var(--omnic-gray-100)" }}>
        <h3 className="font-semibold mb-3">Role defaults</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--omnic-gray-100)" }}>
                <th className="text-left py-2 pe-4">Permission</th>
                <th className="text-center py-2 px-3">Admin</th>
                <th className="text-center py-2 px-3">Teacher</th>
                <th className="text-center py-2 px-3">Student</th>
              </tr>
            </thead>
            <tbody>
              {ALL_PERMISSIONS.map((perm) => (
                <tr
                  key={perm}
                  className="border-b"
                  style={{ borderColor: "var(--omnic-gray-100)" }}
                >
                  <td className="py-1.5 pe-4 text-xs font-mono text-zinc-600">
                    {perm}
                  </td>
                  {["admin", "teacher", "student"].map((role) => (
                    <td key={role} className="text-center py-1.5 px-3">
                      {ROLE_DEFAULTS[role].includes(perm) ? (
                        <Check size={14} className="inline text-green-600" />
                      ) : (
                        <X size={14} className="inline text-zinc-300" />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-user overrides */}
      <div className="rounded-lg border bg-white p-5"
        style={{ borderColor: "var(--omnic-gray-100)" }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Per-user permissions</h3>
          <Input
            placeholder="Search users…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
        </div>
        <div className="space-y-1">
          {filtered.map((user) => (
            <div
              key={user._id}
              className="flex items-center gap-3 rounded border px-3 py-2"
              style={{ borderColor: "var(--omnic-gray-100)" }}
            >
              <StatusPill status={user.role} />
              <span className="font-medium text-sm flex-1">
                {user.name}
              </span>
              <span className="text-xs text-zinc-400">{user.email}</span>
              {user.permissions && user.permissions.length > 0 && (
                <div className="flex flex-wrap gap-1 max-w-[200px]">
                  {user.permissions.map((p) => (
                    <code
                      key={p}
                      className="text-[10px] bg-purple-50 text-purple-700 px-1 rounded"
                    >
                      {p}
                    </code>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
