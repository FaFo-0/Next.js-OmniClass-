"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RotateCcw, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function DeletedSessionsPage() {
  const lessons = useQuery(api.lessons.listDeleted) ?? [];
  const restore = useMutation(api.lessons.restore);

  async function handleRestore(id: Id<"lessons">) {
    try {
      await restore({ id });
      toast.success("Session restored");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Link href="/admin/sessions" className="text-sm underline mb-3 inline-block" style={{ color: "var(--brand-purple)" }}>
        <ArrowLeft size={12} className="inline me-1" /> Back to sessions
      </Link>

      <PageHeader title="Deleted Sessions" subtitle="Restore soft-deleted sessions" />

      {lessons.length === 0 ? (
        <div className="rounded-lg border bg-white p-8 text-center" style={{ borderColor: "var(--omnic-gray-100)" }}>
          <p className="text-zinc-500">No deleted sessions.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {lessons.map((l) => (
            <div
              key={l._id}
              className="flex items-center justify-between rounded-lg border bg-white p-4"
              style={{ borderColor: "var(--omnic-gray-100)" }}
            >
              <div>
                <div className="font-medium">{l.title}</div>
                <div className="text-xs text-zinc-500">
                  Deleted {l.deletedAt ? new Date(l.deletedAt).toLocaleString() : "—"}
                  {l.deletedBy && ` by ${l.deletedBy}`}
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={() => handleRestore(l._id)}>
                <RotateCcw size={14} className="me-1" /> Restore
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
