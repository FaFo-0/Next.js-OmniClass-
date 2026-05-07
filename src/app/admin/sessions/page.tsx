"use client";

import { useQuery } from "convex/react";
import { api } from "@convex";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { useRouter } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, Trash2 } from "lucide-react";
import Link from "next/link";

export default function AdminSessionsPage() {
  const lessons = useQuery(api.lessons.listAllForAdmin) ?? [];
  const router = useRouter();

  const past = lessons.filter((l) =>
    ["transcribed", "review", "published", "no_show_student", "no_show_teacher"].includes(l.status)
  );
  const upcoming = lessons.filter((l) =>
    ["scheduled", "recording"].includes(l.status)
  );

  const now = new Date();

  return (
    <div className="p-6">
      <PageHeader title="Sessions" subtitle={`${lessons.length} total`} />

      <div className="mb-3">
        <Link href="/admin/sessions/deleted" className="text-sm underline" style={{ color: "var(--brand-purple)" }}>
          <Trash2 size={12} className="inline me-1" />
          View deleted sessions →
        </Link>
      </div>

      <Tabs defaultValue="past">
        <TabsList>
          <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
          <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="past" className="mt-3">
          <SessionTable lessons={past} router={router} />
        </TabsContent>
        <TabsContent value="upcoming" className="mt-3">
          <SessionTable lessons={upcoming} router={router} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SessionTable({ lessons, router }: { lessons: any[]; router: any }) {
  return (
    <div className="rounded-lg border bg-white overflow-hidden" style={{ borderColor: "var(--omnic-gray-100)" }}>
      <table className="w-full text-sm">
        <thead style={{ background: "var(--omnic-gray-50)" }}>
          <tr className="border-b" style={{ borderColor: "var(--omnic-gray-100)" }}>
            <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Title</th>
            <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Status</th>
            <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Duration</th>
            <th className="text-left px-4 py-2.5 font-medium text-zinc-500">Date</th>
            <th className="text-right px-4 py-2.5 font-medium text-zinc-500">View</th>
          </tr>
        </thead>
        <tbody>
          {lessons.length === 0 && (
            <tr>
              <td colSpan={5} className="text-center py-8 text-zinc-500">No sessions</td>
            </tr>
          )}
          {lessons.map((l) => (
            <tr key={l._id} className="border-b hover:bg-zinc-50/50" style={{ borderColor: "var(--omnic-gray-100)" }}>
              <td className="px-4 py-2.5 font-medium">{l.title}</td>
              <td className="px-4 py-2.5"><StatusPill status={l.status} /></td>
              <td className="px-4 py-2.5 text-zinc-500">{l.durationSeconds ? `${Math.round(l.durationSeconds / 60)}m` : "—"}</td>
              <td className="px-4 py-2.5 text-zinc-500">{new Date(l.createdAt).toLocaleDateString()}</td>
              <td className="px-4 py-2.5 text-right">
                <Button
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
