"use client";

import { useQuery } from "convex/react";
import { api } from "@convex";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusPill } from "@/components/shared/StatusPill";

export default function PeopleAnalyticsPage() {
  const users = useQuery(api.users.listUsers) ?? [];
  const lessons = useQuery(api.lessons.listAllForAdmin) ?? [];
  const packages = useQuery(api.schedule.listPackagesForOrg) ?? [];

  const totalStudents = users.filter((u) => u.role === "student").length;
  const activeStudents = users.filter((u) => u.role === "student" && u.studentStatus === "active").length;
  const totalTeachers = users.filter((u) => u.role === "teacher").length;
  const completedLessons = lessons.filter((l) => l.status === "published").length;
  const totalSessionsInPackages = packages.reduce((sum, p) => sum + (p.totalSessions ?? 0), 0);
  const usedSessions = packages.reduce((sum, p) => sum + (p.usedSessions ?? 0), 0);

  const stats = [
    { label: "Total students", value: totalStudents },
    { label: "Active students", value: activeStudents },
    { label: "Teachers", value: totalTeachers },
    { label: "Completed lessons", value: completedLessons },
    { label: "Total sessions sold", value: totalSessionsInPackages },
    { label: "Sessions used", value: usedSessions },
  ];

  return (
    <div className="p-6">
      <PageHeader title="Analytics" subtitle="People & usage overview" />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border bg-white p-4"
            style={{ borderColor: "var(--omnic-gray-100)" }}
          >
            <div className="text-xs text-zinc-500 mb-1">{s.label}</div>
            <div className="text-2xl font-bold">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Student status breakdown */}
      <div className="rounded-lg border bg-white p-5"
        style={{ borderColor: "var(--omnic-gray-100)" }}>
        <h3 className="font-semibold mb-3">Student status</h3>
        <div className="space-y-2">
          {["trial", "active", "paused", "cancelled"].map((s) => {
            const count = users.filter((u) => u.studentStatus === s).length;
            return (
              <div key={s} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <StatusPill status={s} />
                  <span className="capitalize">{s}</span>
                </div>
                <span className="font-medium">{count}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
