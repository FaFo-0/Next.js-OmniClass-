"use client";

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import type { FunctionReturnType } from "convex/server";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, Trash2 } from "lucide-react";
import Link from "next/link";

export default function AdminSessionsPage() {
  const lessons = useQuery(api.lessons.listAllForAdmin) ?? [];
  const allUsers = useQuery(api.users.listAllUsers) ?? [];
  const router = useRouter();
  const searchParams = useSearchParams();
  // Deep link from notifications: /admin/sessions?lesson=<id>
  const focusLessonId = searchParams.get("lesson");

  const nameById = new Map(allUsers.map((u) => [u.externalId, u.name]));

  const past = lessons.filter((l) =>
    ["transcribed", "review", "published", "no_show_student", "no_show_teacher"].includes(l.status)
  );
  const upcoming = lessons.filter((l) =>
    ["scheduled", "recording"].includes(l.status)
  );

  // Land the deep-linked lesson on the tab that actually contains it.
  const focusInUpcoming = focusLessonId
    ? upcoming.some((l) => l._id === focusLessonId)
    : false;
  const defaultTab = focusLessonId && !focusInUpcoming ? "past" : "upcoming";

  return (
    <div>
      <PageHeader title="Sessions" subtitle={`${lessons.length} total`} />

      <div className="mb-3">
        <Link href="/admin/sessions/deleted" className="text-sm underline" style={{ color: "var(--brand-purple)" }}>
          <Trash2 size={12} className="inline me-1" />
          View deleted sessions →
        </Link>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="past" className="mt-3">
          <SessionTable lessons={past} router={router} nameById={nameById} focusLessonId={focusLessonId} />
        </TabsContent>
        <TabsContent value="upcoming" className="mt-3">
          <SessionTable lessons={upcoming} router={router} nameById={nameById} focusLessonId={focusLessonId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SessionTable({
  lessons,
  router,
  nameById,
  focusLessonId,
}: {
  lessons: FunctionReturnType<typeof api.lessons.listAllForAdmin>;
  router: ReturnType<typeof useRouter>;
  nameById: Map<string, string>;
  focusLessonId?: string | null;
}) {
  return (
    <div className="tbl-wrap" tabIndex={0} aria-label="Sessions table">
      <table className="tbl" style={{ minWidth: 800 }}>
        <thead style={{ background: "var(--omnic-gray-50)" }}>
          <tr className="border-b" style={{ borderColor: "var(--omnic-gray-100)" }}>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Title</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Teacher</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Student</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Duration</th>
            <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
            <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">View</th>
          </tr>
        </thead>
        <tbody>
          {lessons.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center py-8 text-muted-foreground">No sessions</td>
            </tr>
          )}
          {lessons.map((l) => (
            <tr
              key={l._id}
              className="border-b hover:bg-muted/50"
              style={{
                borderColor: "var(--omnic-gray-100)",
                ...(focusLessonId === l._id
                  ? { background: "var(--omnic-tenant-primary-soft, rgba(103,22,164,0.12))" }
                  : {}),
              }}
            >
              <td className="px-4 py-2.5 font-medium">{l.title}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{nameById.get(l.teacherId) ?? "—"}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{nameById.get(l.studentId) ?? "—"}</td>
              <td className="px-4 py-2.5"><StatusPill status={l.status} /></td>
              <td className="px-4 py-2.5 text-muted-foreground">{l.durationSeconds ? `${Math.round(l.durationSeconds / 60)}m` : "—"}</td>
              <td className="px-4 py-2.5 text-muted-foreground">{new Date(l.createdAt).toLocaleDateString()}</td>
              <td className="px-4 py-2.5 text-right">
                <Button
                  aria-label={`View ${l.title}`}
                  variant="ghost"
                  size="sm"
                  onClick={() => router.push(`/teacher/sessions/${l._id}`)}
                >
                  <Eye size={14} />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
