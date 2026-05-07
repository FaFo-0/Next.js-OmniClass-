"use client";

import { useQuery } from "convex/react";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { Icon } from "@/components/shared/icons";
import { StatusPill } from "@/components/shared/StatusPill";

export default function TeacherStudentsPage() {
  const { user } = useAuth();
  const students = useQuery(api.users.getStudentsForTeacher, {
    teacherId: user?.externalId ?? "",
  }) ?? [];

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, marginBottom: 24 }}>
        <div>
          <h1 className="h1" style={{ margin: 0 }}>Students</h1>
          <div className="body" style={{ marginTop: 4 }}>{students.length} student{students.length === 1 ? "" : "s"} assigned to you</div>
        </div>
      </div>

      <div className="tbl-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Status</th>
              <th>Locale</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {students.map((s: any, i: number) => (
              <tr key={s._id ?? i}>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span className="avatar avatar-sm">
                      {s.name.split(" ").map((n: string) => n[0]).join("")}
                    </span>
                    <span style={{ fontWeight: 600 }}>{s.name}</span>
                  </div>
                </td>
                <td className="muted">{s.email}</td>
                <td><StatusPill status={s.studentStatus ?? s.role} /></td>
                <td className="muted">{s.locale ?? "en"}</td>
                <td style={{ width: 32 }}>
                  <Icon name="chevronRight" size={14} stroke="var(--omnic-gray-400)" />
                </td>
              </tr>
            ))}
            {students.length === 0 && (
              <tr>
                <td colSpan={5} style={{ padding: 32, textAlign: "center" }} className="body-sm">
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
