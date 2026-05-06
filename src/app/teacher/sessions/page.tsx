"use client";

// Sessions list — every recording the teacher has touched. "Start
// Session" button opens modal: pick student, title, mode (live/upload).

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convex";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Video, Upload as UploadIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/shared/PageHeader";
import { StatusPill } from "@/components/shared/StatusPill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

export default function TeacherSessionsPage() {
  const router = useRouter();
  const { currentUserId } = useAuth();
  const lessons = useQuery(
    api.lessons.listForTeacher,
    currentUserId ? { teacherId: currentUserId } : "skip"
  );
  const [open, setOpen] = useState(false);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <PageHeader
        title="Sessions"
        subtitle="All recordings — past and in-progress."
        right={
          <Button onClick={() => setOpen(true)}>
            <Plus size={16} className="me-1" /> Start session
          </Button>
        }
      />

      <div
        className="rounded-lg border bg-white"
        style={{ borderColor: "var(--omnic-gray-100)" }}
      >
        <div
          className="grid grid-cols-12 px-5 py-3 text-xs font-semibold uppercase tracking-wide"
          style={{ color: "var(--omnic-gray-500)" }}
        >
          <div className="col-span-5">Title</div>
          <div className="col-span-3">Student</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Date</div>
        </div>
        {lessons === undefined && (
          <div className="px-5 py-12 text-center text-sm text-zinc-500">
            Loading…
          </div>
        )}
        {lessons && lessons.length === 0 && (
          <div className="px-5 py-12 text-center text-sm text-zinc-500">
            No sessions yet. Click <strong>Start session</strong> to begin.
          </div>
        )}
        {lessons?.map((l) => (
          <div
            key={l._id}
            className="grid grid-cols-12 items-center px-5 py-3 border-t hover:bg-zinc-50"
            style={{ borderColor: "var(--omnic-gray-100)" }}
          >
            <Link
              href={
                l.status === "recording"
                  ? `/teacher/sessions/${l._id}/live`
                  : `/teacher/sessions/${l._id}`
              }
              className="col-span-5 font-medium hover:underline"
              style={{ color: "var(--omnic-gray-900)" }}
            >
              {l.title}
            </Link>
            <div
              className="col-span-3 text-sm"
              style={{ color: "var(--omnic-gray-700)" }}
            >
              <StudentName externalId={l.studentId} />
            </div>
            <div className="col-span-2">
              <StatusPill status={prettyStatus(l.status)} />
            </div>
            <div
              className="col-span-2 text-sm"
              style={{ color: "var(--omnic-gray-500)" }}
            >
              {new Date(l.createdAt).toLocaleDateString()}
            </div>
          </div>
        ))}
      </div>

      <StartSessionDialog
        open={open}
        onClose={() => setOpen(false)}
        onStarted={(lessonId, mode) => {
          setOpen(false);
          if (mode === "live") {
            router.push(`/teacher/sessions/${lessonId}/live`);
          } else {
            router.push(`/teacher/sessions/${lessonId}`);
          }
        }}
      />
    </div>
  );
}

function StudentName({ externalId }: { externalId: string }) {
  const u = useQuery(api.users.getUser, { externalId });
  return <>{u?.name ?? externalId}</>;
}

function prettyStatus(s: string) {
  switch (s) {
    case "recording":
      return "Live";
    case "transcribed":
      return "Transcribed";
    case "review":
      return "Review";
    case "published":
      return "Published";
    case "no_show_student":
      return "No-show (student)";
    case "no_show_teacher":
      return "No-show (teacher)";
    default:
      return "Draft";
  }
}

// ── Start Session modal ──────────────────────────────────────────

function StartSessionDialog({
  open,
  onClose,
  onStarted,
}: {
  open: boolean;
  onClose: () => void;
  onStarted: (lessonId: string, mode: "live" | "upload") => void;
}) {
  const { currentUserId } = useAuth();
  const students = useQuery(
    api.users.getStudentsForTeacher,
    currentUserId ? { teacherId: currentUserId } : "skip"
  );
  const create = useMutation(api.lessons.create);

  const [studentId, setStudentId] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleStart(mode: "live" | "upload") {
    if (!studentId) {
      toast.error("Pick a student");
      return;
    }
    if (!title.trim()) {
      toast.error("Title required");
      return;
    }
    setBusy(true);
    try {
      const id = await create({
        studentId,
        title: title.trim(),
        recordingMode: mode,
      });
      onStarted(id as string, mode);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start session</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label
              className="text-xs font-medium block mb-1"
              style={{ color: "var(--omnic-gray-600)" }}
            >
              Student
            </label>
            <select
              value={studentId}
              onChange={(e) => setStudentId(e.target.value)}
              className="w-full h-9 rounded-md border px-3 text-sm bg-white"
              style={{ borderColor: "var(--omnic-gray-300)" }}
            >
              <option value="">— Pick a student —</option>
              {students?.map((s) => (
                <option key={s.externalId} value={s.externalId}>
                  {s.name} ({s.email})
                </option>
              ))}
            </select>
            {students && students.length === 0 && (
              <p className="text-xs text-zinc-500 mt-1">
                No students assigned yet. Use{" "}
                <code>users:seedUser</code> CLI to create one with{" "}
                <code>teacherId</code>.
              </p>
            )}
          </div>

          <div>
            <label
              className="text-xs font-medium block mb-1"
              style={{ color: "var(--omnic-gray-600)" }}
            >
              Lesson title
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Business English — Negotiation"
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => handleStart("upload")}
          >
            <UploadIcon size={14} className="me-1" /> Upload recording
          </Button>
          <Button disabled={busy} onClick={() => handleStart("live")}>
            <Video size={14} className="me-1" /> Live recording
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
