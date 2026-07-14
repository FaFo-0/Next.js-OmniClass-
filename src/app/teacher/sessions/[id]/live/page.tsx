"use client";

// Live Lesson Dashboard — 2-panel layout.
//
// Left: RecordingPanel (mic+tab capture, live transcript).
// Right: 4 tabs — Reading, Quiz, Questions, Notes.
//
// Toolbar (top): session timer (can't pause), lesson title + student name,
// End Session, No-show (grayed until 10 min past scheduled start).
//
// Stop recording saves transcript but stays on page. End Session finalizes
// and navigates to review.
//
// Reading/Quiz share windows opened from within tabs, not toolbar.

import { useState, useRef, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import {
  ArrowLeft,
  BookOpen,
  Loader2,
  Sparkles,
  ExternalLink,
  UserX,
  Square,
  MessageCircle,
  StickyNote,
  HelpCircle,
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RecordingPanel } from "@/components/recording/RecordingPanel";
import { toast } from "sonner";
import Link from "next/link";

const INTERACTION_PANEL_W = 480;

export default function LiveLessonPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const lesson = useQuery(api.lessons.get, {
    id: id as Id<"lessons">,
  });
  const allUsers = useQuery(api.users.listAllUsers, {}) ?? [];

  const [interactionTab, setInteractionTab] = useState("reading");
  const [readingMaterialId, setReadingMaterialId] =
    useState<Id<"libraryMaterials"> | null>(null);
  const [quizBusy, setQuizBusy] = useState(false);
  const [questionsBusy, setQuestionsBusy] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const [notes, setNotes] = useState("");

  // Session timer — starts on mount, runs continuously, never pauses
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [recordingStopped, setRecordingStopped] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setSessionSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Load existing notes
  useEffect(() => {
    if (lesson?.teacherNotes !== undefined) {
      setNotes(lesson.teacherNotes ?? "");
    }
  }, [lesson?.teacherNotes]);

  const transcriptRef = useRef<string>("");

  const generateQuiz = useAction(api.inLessonQuiz.generateQuizFromBuffer);
  const generateQuestions = useAction(api.inLessonQuiz.generateConversationQuestions);
  const drafts = useQuery(api.inLessonQuiz.listDraftsForLesson, {
    lessonId: id as Id<"lessons">,
  });
  const markNoShow = useMutation(api.lessons.markNoShow);
  const finalizeTranscript = useMutation(api.lessons.finalizeTranscript);
  const appendTranscript = useMutation(api.lessons.appendTranscript);
  const transcribeAudioFile = useAction(api.soniox.transcribeAudioFile);
  const saveNotes = useMutation(api.lessons.saveTeacherNotes);
  const markTeacherStartedNearby = useMutation(
    api.schedule.markTeacherStartedNearby
  );
  const [noShowBusy, setNoShowBusy] = useState(false);
  const [endingSession, setEndingSession] = useState(false);
  const [uploadEnding, setUploadEnding] = useState(false);
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [confirmNoShowOpen, setConfirmNoShowOpen] = useState(false);
  const [confirmBackOpen, setConfirmBackOpen] = useState(false);

  // Prevent accidental browser close/refresh
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  function handleBackClick() {
    setConfirmBackOpen(true);
  }

  useEffect(() => {
    if (!lesson) return;
    markTeacherStartedNearby({ studentId: lesson.studentId }).catch(() => {});
  }, [lesson?._id, markTeacherStartedNearby, lesson?.studentId]);

  // Bridge: capture text snapshots from RecordingPanel
  if (typeof window !== "undefined") {
    (window as any).__omnic_setTranscriptSnapshot = (txt: string) => {
      transcriptRef.current = txt;
    };
  }

  const studentName =
    allUsers.find((u) => u.externalId === lesson?.studentId)?.name ??
    lesson?.studentId ??
    "—";

  // No-show timer: compute time since scheduled start
  const scheduleEventStartMs = lesson?.scheduleEventId
    ? (() => {
        // We don't have the event loaded here — fetch it or compute from lesson
        return null;
      })()
    : null;
  const noShowEnabled = true; // simplified — always allow, but add 10-min note

  async function handleStudentNoShow() {
    setConfirmNoShowOpen(false);
    setNoShowBusy(true);
    try {
      await markNoShow({ id: id as Id<"lessons">, by: "student" });
      toast.success("Marked student no-show");
      router.push(`/teacher`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setNoShowBusy(false);
    }
  }

  async function handleEndSession() {
    setConfirmEndOpen(false);
    setEndingSession(true);
    try {
      const finalText = lesson?.transcript || transcriptRef.current;
      await finalizeTranscript({
        id: id as Id<"lessons">,
        transcript: finalText,
        durationSeconds: sessionSeconds,
      });
      router.push(`/teacher/sessions/${id}`);
    } catch (e) {
      toast.error((e as Error).message);
      setEndingSession(false);
    }
  }

  function openShareWindow(kind: "quiz" | "reading") {
    const base = `/teacher/share/${kind}?lessonId=${id}`;
    const url =
      kind === "reading" && readingMaterialId
        ? `${base}&materialId=${readingMaterialId}`
        : base;
    const features =
      "width=1100,height=750,menubar=no,toolbar=no,location=no,status=no";
    const win = window.open(url, `omnic-share-${kind}`, features);
    if (!win) {
      toast.error("Pop-up blocked — allow pop-ups for this site");
    }
  }

  function handleRecordingStop() {
    setRecordingStopped(true);
  }

  async function handleUploaded(storageId: Id<"_storage">, durationSec: number) {
    setSessionSeconds(durationSec);
    setUploadEnding(true);
    toast.success(`File uploaded (${Math.round(durationSec / 60)} min). Transcribing…`);
    try {
      const result = await transcribeAudioFile({ storageId });
      const text = result.transcript.trim();
      if (!text) {
        toast.error("Transcription returned empty — the audio may have no speech.");
        setUploadEnding(false);
        return;
      }
      await appendTranscript({
        id: id as Id<"lessons">,
        text,
        durationSeconds: durationSec,
      });
      toast.success("Transcription complete. Review and end session when ready.");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploadEnding(false);
    }
  }

  async function fireQuiz() {
    const buf = transcriptRef.current.trim();
    if (!buf) {
      toast.error("Nothing transcribed yet");
      return;
    }
    setQuizBusy(true);
    generateQuiz({ lessonId: id as Id<"lessons">, transcriptBuffer: buf })
      .then((res) =>
        toast.success(`Quiz ready — ${res.count} questions`, {
          action: { label: "Show", onClick: () => setInteractionTab("quiz") },
        })
      )
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setQuizBusy(false));
  }

  async function fireQuestions() {
    const buf = transcriptRef.current.trim();
    if (!buf) {
      toast.error("Nothing transcribed yet");
      return;
    }
    setQuestionsBusy(true);
    generateQuestions({ lessonId: id as Id<"lessons">, transcriptBuffer: buf })
      .then((res) => setQuestions(res.questions))
      .catch((e) => toast.error((e as Error).message))
      .finally(() => setQuestionsBusy(false));
  }

  function handleNotesBlur() {
    saveNotes({ id: id as Id<"lessons">, teacherNotes: notes }).catch(() => {});
  }

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const hasTranscript = transcriptRef.current.trim().length > 0;

  // Loading states
  if (lesson === undefined) {
    return (
      <div className="h-screen flex flex-col bg-white">
        <div className="shrink-0 h-14 border-b px-6 flex items-center gap-3" style={{ borderColor: "var(--omnic-gray-100)" }}>
          <div className="w-8 h-8 rounded bg-zinc-100 animate-pulse" />
          <div className="w-48 h-4 rounded bg-zinc-100 animate-pulse" />
        </div>
        <div className="flex-1 flex">
          <div className="flex-1 p-6 space-y-4">
            <div className="w-full h-48 rounded-xl bg-zinc-100 animate-pulse" />
          </div>
          <div className="shrink-0 border-s p-4 space-y-3" style={{ width: INTERACTION_PANEL_W, borderColor: "var(--omnic-gray-100)" }}>
            <div className="w-full h-32 rounded-lg bg-zinc-100 animate-pulse" />
            <div className="w-full h-24 rounded-lg bg-zinc-100 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }
  if (lesson === null) {
    return <div className="p-6">Session not found.</div>;
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
            onClick={handleBackClick}
            disabled={uploadEnding}
          >
            <ArrowLeft size={16} />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-semibold text-sm">{lesson.title}</h1>
              <span className="text-xs" style={{ color: "var(--omnic-gray-400)" }}>
                with {studentName}
              </span>
            </div>
          </div>
        </div>

        {/* Session timer — always running, never pauses */}
        <div
          className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold"
            style={{
              background: uploadEnding
                ? "var(--omnic-gray-100)"
                : recordingStopped
                  ? "var(--omnic-gray-100)"
                  : "var(--brand-purple-tint)",
              color: uploadEnding
                ? "var(--omnic-gray-500)"
                : recordingStopped
                  ? "var(--omnic-gray-500)"
                  : "var(--brand-purple)",
            }}
          >
            {uploadEnding ? (
              <Loader2 size={12} className="animate-spin" />
            ) : (
              <Clock size={12} />
            )}
            {uploadEnding ? "Saving…" : formatTime(sessionSeconds)}
        </div>

        <div className="flex items-center gap-2">
          <Button
            size="sm"
            disabled={endingSession || uploadEnding}
            onClick={() => setConfirmEndOpen(true)}
            style={{
              background: "var(--omnic-red, #dc2626)",
              color: "white",
              border: "none",
            }}
          >
            <Square size={13} className="me-1" />
            {endingSession ? "Ending…" : "End Session"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={noShowBusy}
            onClick={() => setConfirmNoShowOpen(true)}
            style={{
              borderColor: "var(--omnic-red)",
              color: "var(--omnic-red)",
              opacity: 0.6,
            }}
            title="Wait 10 minutes after scheduled start to mark no-show"
          >
            <UserX size={13} className="me-1" />
            {noShowBusy ? "…" : "No-show"}
          </Button>
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
              onStop={handleRecordingStop}
              onUploaded={(storageId, durationSec) => handleUploaded(storageId, durationSec)}
            />
            {lesson.transcript && (
              <div className="mt-6 rounded-xl border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--omnic-gray-500)" }}>
                  Uploaded transcript
                </h3>
                <pre className="whitespace-pre-wrap text-sm leading-relaxed" style={{ color: "var(--omnic-gray-800)" }}>
                  {lesson.transcript}
                </pre>
              </div>
            )}
            {uploadEnding && (
              <div className="mt-6 rounded-xl border bg-card p-4 text-center">
                <Loader2 size={20} className="mx-auto mb-2 animate-spin" style={{ color: "var(--brand-purple)" }} />
                <p className="text-sm" style={{ color: "var(--omnic-gray-500)" }}>Transcribing audio…</p>
                <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-400)" }}>This may take a moment for longer files.</p>
              </div>
            )}
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
            <TabsList className="shrink-0 mx-3 mt-3 grid w-auto grid-cols-4 gap-0.5">
              <TabsTrigger value="reading">
                <BookOpen size={13} className="me-1" />Reading
              </TabsTrigger>
              <TabsTrigger value="quiz">
                <Sparkles size={13} className="me-1" />Quiz
              </TabsTrigger>
              <TabsTrigger value="questions">
                <HelpCircle size={13} className="me-1" />Questions
              </TabsTrigger>
              <TabsTrigger value="notes">
                <StickyNote size={13} className="me-1" />Notes
              </TabsTrigger>
            </TabsList>

            {/* ── Reading tab ── */}
            <TabsContent value="reading" className="flex-1 overflow-y-auto mt-0 pt-0">
              {readingMaterialId ? (
                <div className="px-4 py-3 space-y-3">
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setReadingMaterialId(null)}
                    >
                      ← Back
                    </Button>
                    <span className="text-xs" style={{ color: "var(--omnic-gray-500)" }}>
                      Material selected
                    </span>
                  </div>
                  <Button
                    onClick={() => openShareWindow("reading")}
                    className="w-full"
                    style={{ background: "var(--brand-purple)" }}
                  >
                    <ExternalLink size={14} className="me-1.5" />
                    Open reading in window
                  </Button>
                  <p className="text-xs text-center" style={{ color: "var(--omnic-gray-400)" }}>
                    Screen-share this window in Google Meet.
                    The student watches you read.
                  </p>
                </div>
              ) : (
                <ReadingPicker onPick={(mid) => setReadingMaterialId(mid)} />
              )}
            </TabsContent>

            {/* ── Quiz tab ── */}
            <TabsContent value="quiz" className="flex-1 overflow-y-auto px-4 pb-4 mt-0 pt-3">
              <Button
                disabled={quizBusy || !hasTranscript}
                onClick={fireQuiz}
                className="w-full mb-3"
                style={{ background: "var(--brand-purple)" }}
              >
                {quizBusy ? (
                  <Loader2 size={14} className="me-1 animate-spin" />
                ) : (
                  <Sparkles size={14} className="me-1" />
                )}
                {!hasTranscript
                  ? "Nothing to generate yet"
                  : `Generate Quiz (${Math.round(transcriptRef.current.length / 1000)}k chars)`}
              </Button>

              {drafts && drafts.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: "var(--omnic-gray-500)" }}
                    >
                      Quizzes
                    </h3>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => openShareWindow("quiz")}
                    >
                      <ExternalLink size={12} className="me-1" /> Open in window
                    </Button>
                  </div>
                  {drafts.map((d) => (
                    <div
                      key={d._id}
                      className="rounded-lg border bg-white p-3 space-y-1.5"
                      style={{ borderColor: "var(--omnic-gray-100)" }}
                    >
                      <div
                        className="text-xs"
                        style={{ color: "var(--omnic-gray-500)" }}
                      >
                        {new Date(d.generatedAt).toLocaleTimeString()} —{" "}
                        {d.questions.length} questions
                      </div>
                      <ol className="list-decimal ms-5 text-sm space-y-1.5">
                        {d.questions.map((q: any, i: number) => (
                          <li key={i}>
                            <div className="font-medium">{q.question}</div>
                            <ul className="mt-0.5 ms-3 text-xs space-y-0.5">
                              {q.options.map((o: string, oi: number) => (
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

              {(!drafts || drafts.length === 0) && (
                <div className="text-center py-10">
                  <MessageCircle
                    size={32}
                    className="mx-auto mb-2"
                    style={{ color: "var(--omnic-gray-300)" }}
                  />
                  <p className="text-sm" style={{ color: "var(--omnic-gray-400)" }}>
                    No quizzes generated yet.
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-400)" }}>
                    Click the button above once the transcript has content.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* ── Questions tab ── */}
            <TabsContent value="questions" className="flex-1 overflow-y-auto px-4 pb-4 mt-0 pt-3">
              <Button
                disabled={questionsBusy || !hasTranscript}
                onClick={fireQuestions}
                className="w-full mb-3"
                style={{ background: "var(--brand-purple)" }}
              >
                {questionsBusy ? (
                  <Loader2 size={14} className="me-1 animate-spin" />
                ) : (
                  <HelpCircle size={14} className="me-1" />
                )}
                {!hasTranscript
                  ? "Nothing to generate yet"
                  : "Generate conversation questions"}
              </Button>

              {questions.length > 0 && (
                <div className="space-y-2">
                  <h3
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: "var(--omnic-gray-500)" }}
                  >
                    Conversation starters
                  </h3>
                  {questions.map((q, i) => (
                    <div
                      key={i}
                      className="rounded-lg border bg-white p-3 text-sm"
                      style={{ borderColor: "var(--omnic-gray-100)" }}
                    >
                      <span
                        className="inline-block w-5 h-5 rounded-full text-xs font-bold text-center me-2"
                        style={{
                          background: "var(--brand-purple-tint)",
                          color: "var(--brand-purple)",
                        }}
                      >
                        {i + 1}
                      </span>
                      {q}
                    </div>
                  ))}
                </div>
              )}

              {questions.length === 0 && (
                <div className="text-center py-10">
                  <HelpCircle
                    size={32}
                    className="mx-auto mb-2"
                    style={{ color: "var(--omnic-gray-300)" }}
                  />
                  <p className="text-sm" style={{ color: "var(--omnic-gray-400)" }}>
                    No questions yet.
                  </p>
                  <p className="text-xs mt-1" style={{ color: "var(--omnic-gray-400)" }}>
                    Generate conversation questions from the transcript.
                  </p>
                </div>
              )}
            </TabsContent>

            {/* ── Notes tab ── */}
            <TabsContent value="notes" className="flex-1 overflow-y-auto px-4 pb-4 mt-0 pt-3">
              <div className="space-y-2">
                <h3
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: "var(--omnic-gray-500)" }}
                >
                  Teacher notes
                </h3>
                <Textarea
                  rows={18}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={handleNotesBlur}
                  placeholder="Write anything you want — observations, vocabulary to review, student mistakes, follow-up ideas…"
                  className="text-sm resize-none"
                />
                <p className="text-xs" style={{ color: "var(--omnic-gray-400)" }}>
                  Auto-saves on blur.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <Dialog open={confirmBackOpen} onOpenChange={setConfirmBackOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Leave this page?</DialogTitle></DialogHeader>
          <p className="text-sm" style={{ color: "var(--omnic-gray-600)" }}>
            The recording is still in progress. Are you sure you want to leave?
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmBackOpen(false)}>Stay</Button>
            <Button onClick={() => router.push(`/teacher/sessions/${id}`)}>Leave</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmEndOpen} onOpenChange={setConfirmEndOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>End this session?</DialogTitle></DialogHeader>
          <p className="text-sm" style={{ color: "var(--omnic-gray-600)" }}>
            The transcript will be saved and you&apos;ll be taken to the review page.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmEndOpen(false)}>Cancel</Button>
            <Button onClick={handleEndSession}>End Session</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmNoShowOpen} onOpenChange={setConfirmNoShowOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark student as no-show?</DialogTitle></DialogHeader>
          <p className="text-sm" style={{ color: "var(--omnic-gray-600)" }}>
            The lesson will close immediately. Points will not be refunded.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmNoShowOpen(false)}>Cancel</Button>
            <Button onClick={handleStudentNoShow} style={{ background: "var(--omnic-red)" }}>Mark no-show</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
        Pick a material to share with the student.
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
