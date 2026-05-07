"use client";

// Live Lesson Dashboard — 2-panel layout.
//
// Left panel: live transcription (RecordingPanel with mic+tab capture).
// Right panel: interaction hub with two tabs:
//   1. Quiz — on-the-spot generation (fire-and-forget), quiz drafts shown inline
//   2. Reading — material picker + ReadingView (word-tap → push to student)
//
// Toolbar: back, lesson title, recording controls (pause/resume, stop).
//
// HARD RULE: Generate Quiz uses api.inLessonQuiz.generateQuizFromBuffer
// fire-and-forget. The Soniox WebSocket inside RecordingPanel is
// unaffected — it lives in a separate React subtree with its own state
// and never awaits this action.

import { useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useAction } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import {
  ArrowLeft,
  BookOpen,
  Loader2,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecordingPanel } from "@/components/recording/RecordingPanel";
import { ReadingView } from "@/components/library/ReadingView";
import { toast } from "sonner";
import Link from "next/link";

const INTERACTION_PANEL_W = 400;

export default function LiveLessonPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const lesson = useQuery(api.lessons.get, {
    id: id as Id<"lessons">,
  });

  const [interactionTab, setInteractionTab] = useState("quiz");
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
    generateQuiz({
      lessonId: id as Id<"lessons">,
      transcriptBuffer: buf.slice(-3000),
    })
      .then((res) =>
        toast.success(`Quiz ready — ${res.count} questions`, {
          action: {
            label: "Show",
            onClick: () => setInteractionTab("quiz"),
          },
        })
      )
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setQuizBusy(false));
  }

  return (
    <div className="h-screen flex flex-col bg-white">
      {/* ═══ Toolbar ═══ */}
      <div
        className="shrink-0 z-20 flex items-center justify-between gap-3 px-6 h-14 border-b bg-white"
        style={{ borderColor: "var(--omnic-gray-100)" }}
      >
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push(`/teacher/sessions/${id}`)}
          >
            <ArrowLeft size={16} />
          </Button>
          <div>
            <h1 className="font-semibold text-sm">{lesson.title}</h1>
            <p
              className="text-xs"
              style={{ color: "var(--omnic-gray-500)" }}
            >
              Live lesson
            </p>
          </div>
        </div>
      </div>

      {/* ═══ 2-Panel Body ═══ */}
      <div className="flex-1 flex overflow-hidden">
        {/* ── Left: Transcription ── */}
        <div
          className="flex-1 overflow-y-auto border-e"
          style={{ borderColor: "var(--omnic-gray-100)" }}
        >
          <div className="p-4 max-w-3xl mx-auto">
            <RecordingPanel
              lessonId={id as Id<"lessons">}
              onRecordingComplete={() =>
                router.push(`/teacher/sessions/${id}`)
              }
            />
          </div>
        </div>

        {/* ── Right: Interaction Panel ── */}
        <div
          className="shrink-0 overflow-y-auto"
          style={{ width: INTERACTION_PANEL_W }}
        >
          <Tabs
            value={interactionTab}
            onValueChange={setInteractionTab}
            className="h-full flex flex-col"
          >
            <TabsList className="shrink-0 mx-3 mt-3 grid w-auto grid-cols-2">
              <TabsTrigger value="quiz">
                <Sparkles size={13} className="me-1.5" /> Quiz
              </TabsTrigger>
              <TabsTrigger value="reading">
                <BookOpen size={13} className="me-1.5" /> Reading
              </TabsTrigger>
            </TabsList>

            {/* ── Quiz tab ── */}
            <TabsContent value="quiz" className="flex-1 overflow-y-auto px-4 pb-4 mt-0 pt-3">
              <Button
                disabled={quizBusy}
                onClick={fireQuiz}
                className="w-full mb-3"
                style={{ background: "var(--brand-purple)" }}
              >
                {quizBusy ? (
                  <Loader2 size={14} className="me-1 animate-spin" />
                ) : (
                  <Sparkles size={14} className="me-1" />
                )}
                Generate Quiz from Transcript
              </Button>

              {drafts && drafts.length > 0 ? (
                <div className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--omnic-gray-500)" }}>
                    On-the-spot quizzes
                  </h3>
                  {drafts.map((d) => (
                    <div
                      key={d._id}
                      className="rounded-lg border bg-white p-3 space-y-1.5"
                      style={{ borderColor: "var(--omnic-gray-100)" }}
                    >
                      <div className="text-xs" style={{ color: "var(--omnic-gray-500)" }}>
                        {new Date(d.generatedAt).toLocaleTimeString()} — {d.questions.length} questions
                      </div>
                      <ol className="list-decimal ms-5 text-sm space-y-1.5">
                        {d.questions.map((q, i) => (
                          <li key={i}>
                            <div className="font-medium">{q.question}</div>
                            <ul className="mt-0.5 ms-3 text-xs space-y-0.5">
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
              ) : (
                <div className="text-center py-10">
                  <p className="text-sm" style={{ color: "var(--omnic-gray-400)" }}>
                    No quizzes generated yet.
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-400)" }}>
                    Click the button above once the transcript has content.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* ── Reading tab ── */}
            <TabsContent value="reading" className="flex-1 overflow-y-auto mt-0 pt-0">
              {readingMaterialId ? (
                <ReadingMaterialPanel
                  materialId={readingMaterialId}
                  activeStudentId={lesson.studentId}
                  onBack={() => setReadingMaterialId(null)}
                />
              ) : (
                <ReadingPicker onPick={(mid) => setReadingMaterialId(mid)} />
              )}
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function ReadingPicker({
  onPick,
}: {
  onPick: (id: Id<"libraryMaterials">) => void;
}) {
  const materials = useQuery(api.library.listPublished) ?? [];
  return (
    <div className="px-4 py-3 space-y-2">
      <p className="text-sm" style={{ color: "var(--omnic-gray-600)" }}>
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
                className="font-medium text-sm"
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

function ReadingMaterialPanel({
  materialId,
  activeStudentId,
  onBack,
}: {
  materialId: Id<"libraryMaterials">;
  activeStudentId: string;
  onBack: () => void;
}) {
  const material = useQuery(api.library.get, { id: materialId });
  if (material === undefined) return <div className="p-6 text-sm text-zinc-500">Loading…</div>;
  if (material === null) return <div className="p-6 text-sm">Not found.</div>;
  return (
    <div>
      <div
        className="px-4 py-2 border-b flex items-center gap-2"
        style={{ borderColor: "var(--omnic-gray-100)" }}
      >
        <Button variant="ghost" size="sm" onClick={onBack}>
          ← Library
        </Button>
        <span className="text-xs font-medium" style={{ color: "var(--omnic-gray-600)" }}>
          {material.title}
        </span>
      </div>
      <ReadingView
        material={material}
        mode="live-teach"
        activeStudentId={activeStudentId}
      />
    </div>
  );
}
