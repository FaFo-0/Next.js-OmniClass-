"use client";

import { useQuery } from "convex/react";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusPill } from "@/components/shared/StatusPill";

export default function TeacherStudentsPage() {
  const { user } = useAuth();
  const students = useQuery(api.users.getStudentsForTeacher, {
    teacherId: user?.externalId ?? "",
  }) ?? [];

  return (
    <div>
      <PageHeader title="Students" subtitle={`${students.length} students`} />
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--omnic-gray-100)]">
              {["Name", "Email", "Status", "Locale"].map((h) => (
                <th key={h} className="text-left px-5 py-3 text-xs font-medium text-[var(--omnic-gray-400)] uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {students.map((s, i) => (
              <tr key={s._id ?? i} className="border-b border-[var(--omnic-gray-100)] hover:bg-[var(--omnic-gray-50)]">
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-semibold" style={{ backgroundColor: "var(--omnic-tenant-primary-soft)", color: "var(--omnic-tenant-primary)" }}>
                      {s.name.split(" ").map((n: string) => n[0]).join("")}
                    </div>
                    <span className="font-medium text-sm">{s.name}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-sm text-[var(--omnic-gray-400)]">{s.email}</td>
                <td className="px-5 py-3">
                  <StatusPill status={s.studentStatus ?? s.role} />
                </td>
                <td className="px-5 py-3 text-sm text-[var(--omnic-gray-400)]">{s.locale ?? "en"}</td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={4} className="px-5 py-6 text-center text-sm text-[var(--omnic-gray-400)]">
                  No students assigned yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
