"use client";

// Live Lesson Dashboard.
//
// Layout: minimal chrome — page-level toolbar (title, timer, Stop &
// Save) + RecordingPanel (mic+tab capture, live transcript) + action
// bar (Open Reading Hub, Generate Quiz from buffer).
//
// HARD RULE: Generate Quiz button calls api.inLessonQuiz.generateQuizFromBuffer
// fire-and-forget. The Soniox WebSocket inside RecordingPanel is
// unaffected — it lives in a separate React subtree with its own state
// and never awaits this action.

import { useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useAction } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { ArrowLeft, BookOpen, Sparkles, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RecordingPanel } from "@/components/recording/RecordingPanel";
import { ReadingView } from "@/components/library/ReadingView";
import { toast } from "sonner";
import Link from "next/link";

export default function LiveLessonPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const lesson = useQuery(api.lessons.get, {
    id: id as Id<"lessons">,
  });

  const [readingOpen, setReadingOpen] = useState(false);
  const [readingMaterialId, setReadingMaterialId] =
    useState<Id<"libraryMaterials"> | null>(null);
  const [quizBusy, setQuizBusy] = useState(false);
  // Snapshot of the current transcript text. RecordingPanel writes a
  // ref via the global window for now to keep the UI surface decoupled
  // from internal token state. Phase H polish can refactor to a proper
  // context if needed.
  const transcriptRef = useRef<string>("");

  const generateQuiz = useAction(api.inLessonQuiz.generateQuizFromBuffer);
  const drafts = useQuery(api.inLessonQuiz.listDraftsForLesson, {
    lessonId: id as Id<"lessons">,
  });

  if (lesson === undefined) {
    return (
      <div className="p-12 text-center text-zinc-500">Loading session…</div>
    );
  }
  if (lesson === null) {
    return <div className="p-6">Session not found.</div>;
  }

  // Bridge: capture text snapshots from RecordingPanel via a global
  // hook the recorder can populate. Cheap, scoped to this page.
  if (typeof window !== "undefined") {
    (window as any).__omnic_setTranscriptSnapshot = (txt: string) => {
      transcriptRef.current = txt;
    };
  }

  async function fireQuiz() {
    const buf = transcriptRef.current.trim();
    if (!buf) {
      toast.error("Nothing transcribed yet");
      return;
    }
    setQuizBusy(true);
    // FIRE AND FORGET — do not block, do not await on the Soniox path.
    generateQuiz({
      lessonId: id as Id<"lessons">,
      transcriptBuffer: buf.slice(-3000), // last ~3 min of speech worth
    })
      .then((res) =>
        toast.success(`Quiz ready — ${res.count} questions`, {
          action: {
            label: "Show",
            onClick: () =>
              document
                .getElementById("in-lesson-drafts")
                ?.scrollIntoView({ behavior: "smooth" }),
          },
        })
      )
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setQuizBusy(false));
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Toolbar */}
      <div
        className="sticky top-0 z-20 flex items-center justify-between gap-3 px-6 h-14 border-b bg-white"
        style={{ borderColor: "var(--omnic-gray-100)" }}
      >
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/teacher/sessions")}
          >
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 className="font-semibold text-sm">{lesson.title}</h1>
            <p
              className="text-xs"
              style={{ color: "var(--omnic-gray-500)" }}
            >
              Live recording
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setReadingOpen(true)}
          >
            <BookOpen size={16} className="me-1" /> Open reading
          </Button>
          <Button
            disabled={quizBusy}
            onClick={fireQuiz}
            style={{ background: "var(--brand-purple)" }}
          >
            {quizBusy ? (
              <Loader2 size={14} className="me-1 animate-spin" />
            ) : (
              <Sparkles size={14} className="me-1" />
            )}
            Generate quiz
          </Button>
        </div>
      </div>

      {/* Recording panel */}
      <div className="max-w-3xl mx-auto p-6">
        <RecordingPanel
          lessonId={id as Id<"lessons">}
          onRecordingComplete={() =>
            router.push(`/teacher/sessions/${id}`)
          }
        />
      </div>

      {/* In-lesson quiz drafts */}
      {drafts && drafts.length > 0 && (
        <div
          id="in-lesson-drafts"
          className="max-w-3xl mx-auto p-6 pt-0 space-y-4"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--omnic-gray-500)" }}>
            On-the-spot quizzes
          </h2>
          {drafts.map((d) => (
            <div
              key={d._id}
              className="rounded-lg border bg-white p-4 space-y-2"
              style={{ borderColor: "var(--omnic-gray-100)" }}
            >
              <div
                className="text-xs"
                style={{ color: "var(--omnic-gray-500)" }}
              >
                Generated {new Date(d.generatedAt).toLocaleTimeString()} —{" "}
                {d.questions.length} questions
              </div>
              <ol className="list-decimal ms-5 text-sm space-y-2">
                {d.questions.map((q, i) => (
                  <li key={i}>
                    <div className="font-medium">{q.question}</div>
                    <ul className="mt-1 ms-3 text-xs space-y-0.5">
                      {q.options.map((o, oi) => (
                        <li
                          key={oi}
                          className={
                            oi === q.correctIndex
                              ? "font-semibold text-green-700"
                              : ""
                          }
                        >
                          {String.fromCharCode(65 + oi)}. {o}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      )}

      {/* Reading Hub side sheet */}
      <Sheet open={readingOpen} onOpenChange={setReadingOpen}>
        <SheetContent
          side="right"
          className="w-full sm:max-w-2xl p-0 overflow-y-auto"
        >
          <SheetHeader
            className="px-6 py-3 border-b flex flex-row items-center justify-between"
            style={{ borderColor: "var(--omnic-gray-100)" }}
          >
            <SheetTitle>Reading Hub</SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setReadingOpen(false)}
            >
              <X size={16} />
            </Button>
          </SheetHeader>
          {readingMaterialId ? (
            <ReadingMaterialInSheet
              materialId={readingMaterialId}
              activeStudentId={lesson.studentId}
              onBack={() => setReadingMaterialId(null)}
            />
          ) : (
            <ReadingMaterialPicker
              onPick={(mid) => setReadingMaterialId(mid)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ReadingMaterialPicker({
  onPick,
}: {
  onPick: (id: Id<"libraryMaterials">) => void;
}) {
  const materials = useQuery(api.library.listPublished) ?? [];
  return (
    <div className="p-4 space-y-2">
      <p
        className="text-sm"
        style={{ color: "var(--omnic-gray-600)" }}
      >
        Pick a material to read with the student. Tapping a word here
        sends it directly to their flashcards.
      </p>
      {materials.length === 0 && (
        <Link
          href="/admin/library"
          className="text-sm underline"
          style={{ color: "var(--brand-purple)" }}
        >
          No materials yet — add one in /admin/library →
        </Link>
      )}
      <div className="space-y-2">
        {materials.map((m) => (
          <button
            key={m._id}
            onClick={() => onPick(m._id)}
            className="w-full text-start rounded-lg border bg-white p-3 hover:shadow-md transition-shadow"
            style={{ borderColor: "var(--omnic-gray-100)" }}
          >
            <div className="flex justify-between items-start gap-3">
              <span
                className="font-medium"
                style={{ color: "var(--omnic-gray-900)" }}
              >
                {m.title}
              </span>
              {m.levelCEFR && (
                <span className="pill pill-tenant">{m.levelCEFR}</span>
              )}
            </div>
            {m.description && (
              <div
                className="mt-1 text-xs"
                style={{ color: "var(--omnic-gray-500)" }}
              >
                {m.description}
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReadingMaterialInSheet({
  materialId,
  activeStudentId,
  onBack,
}: {
  materialId: Id<"libraryMaterials">;
  activeStudentId: string;
  onBack: () => void;
}) {
  const material = useQuery(api.library.get, { id: materialId });
  if (material === undefined) return <div className="p-6">Loading…</div>;
  if (material === null) return <div className="p-6">Not found.</div>;
  return (
    <div>
      <div
        className="px-6 py-2 border-b flex items-center gap-2"
        style={{ borderColor: "var(--omnic-gray-100)" }}
      >
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Library
        </Button>
      </div>
      <ReadingView
        material={material}
        mode="live-teach"
        activeStudentId={activeStudentId}
      />
    </div>
  );
}
