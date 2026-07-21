"use client";

// Session review page.
//
// Tabs: Transcript + Notes, Summary, Vocabulary, Flashcards, Homework.
// Quiz merged into Homework. Teacher Notes editable inline and included
// in AI prompts. All sections manually editable. No "Generate All."

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  UserX,
  Plus,
  X,
  StickyNote,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StatusPill } from "@/components/shared/StatusPill";
import { HomeworkEditor } from "@/components/homework/HomeworkEditor";
import { scoreDoc } from "@/components/homework/grading";
import { toast } from "sonner";

type Section = "summary" | "vocabulary";

const SECTION_TO_PROMPT: Record<Section, string> = {
  summary: "lesson_summary",
  vocabulary: "vocab_extraction",
};

export default function SessionReviewPage() {
  const { id } = useParams<{ id: string }>();
  const lessonId = id as Id<"lessons">;
  const router = useRouter();

  const lesson = useQuery(api.lessons.get, { id: lessonId });
  const vocab = useQuery(api.lessonContent.listVocab, { lessonId }) ?? [];
  const promptConfigs = useQuery(api.promptConfigs.listForOrg) ?? [];
  const homeworkList = useQuery(api.homework.listForLesson, { lessonId }) ?? [];
  const homework = homeworkList[0];

  const updateContent = useMutation(api.lessons.updateContent);
  const replaceVocab = useMutation(api.lessonContent.replaceVocab);
  const publish = useMutation(api.lessons.publish);
  const reopen = useMutation(api.lessons.reopen);
  const softDelete = useMutation(api.lessons.softDelete);
  const markNoShow = useMutation(api.lessons.markNoShow);
  const saveTeacherNotes = useMutation(api.lessons.saveTeacherNotes);
  const aiGenerate = useAction(api.ai.generate);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState<Section | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const [editableVocab, setEditableVocab] = useState<any[]>([]);
  const [vocabDirty, setVocabDirty] = useState(false);

  useEffect(() => {
    if (!lesson) return;
    setTitle(lesson.title);
    setSummary(lesson.summary);
    setNotes(lesson.teacherNotes ?? "");
  }, [lesson]);

  useEffect(() => {
    if (vocab.length > 0 && !vocabDirty) {
      setEditableVocab(vocab.map((v) => ({ ...v })));
    }
  }, [vocab, vocabDirty]);

  // Build transcript with notes included for AI
  const transcriptWithNotes = [
    lesson?.transcript,
    lesson?.teacherNotes ? `\n\n--- Teacher Notes ---\n${lesson.teacherNotes}` : "",
  ]
    .filter(Boolean)
    .join("");

  if (lesson === undefined) {
    return <div className="p-12 text-center text-zinc-500">Loading…</div>;
  }
  if (lesson === null) return <div className="p-6">Not found.</div>;

  const isLive = lesson.status === "recording";

  const allApproved =
    lesson.contentStatus.summary === "approved" &&
    lesson.contentStatus.vocabulary === "approved";

  function findPrompt(configId: string) {
    const p = promptConfigs.find((c) => c.configId === configId);
    if (!p) return null;
    return {
      configId: p.configId,
      systemPrompt: p.systemPrompt,
      userPromptTemplate: p.userPromptTemplate,
      model: p.model,
      temperature: p.temperature,
      maxTokens: p.maxTokens,
    };
  }

  async function generateSection(section: Section) {
    const cfg = findPrompt(SECTION_TO_PROMPT[section]);
    if (!cfg) {
      toast.error(`Prompt config "${SECTION_TO_PROMPT[section]}" not found`);
      return;
    }
    const source = transcriptWithNotes;
    if (!source.trim()) {
      toast.error("No transcript to generate from");
      return;
    }

    setGenerating(section);
    try {
      await updateContent({
        id: lessonId,
        contentStatusPatch: { [section]: "generating" } as any,
      });

      const { content } = await aiGenerate({
        promptConfigId: cfg.configId,
        transcript: source,
        systemPrompt: cfg.systemPrompt,
        userPromptTemplate: cfg.userPromptTemplate,
        model: cfg.model,
        temperature: cfg.temperature,
        maxTokens: cfg.maxTokens,
      });

      if (section === "summary") {
        setSummary(content);
        await updateContent({
          id: lessonId,
          summary: content,
          contentStatusPatch: { summary: "review" } as any,
        });
      } else if (section === "vocabulary") {
        const items = parseJsonArray(content).map((it: any) => ({
          word: it.word ?? it.term ?? "",
          translation: it.translation ?? "",
          translationLocale: (it.translationLocale ?? "ru") as "en" | "ru" | "ar",
          partOfSpeech: it.partOfSpeech ?? "",
          exampleSentence: it.exampleSentence,
          ipa: it.ipa,
        }));
        await replaceVocab({ lessonId, items });
        setVocabDirty(false);
        await updateContent({
          id: lessonId,
          contentStatusPatch: { vocabulary: "review" } as any,
        });
      }

      toast.success(`${section} generated`);
    } catch (e) {
      await updateContent({
        id: lessonId,
        contentStatusPatch: { [section]: "pending" } as any,
      });
      toast.error((e as Error).message);
    } finally {
      setGenerating(null);
    }
  }

  async function approve(section: Section) {
    if (section === "summary") {
      await updateContent({
        id: lessonId,
        summary,
        contentStatusPatch: { summary: "approved" } as any,
      });
    } else {
      await updateContent({
        id: lessonId,
        contentStatusPatch: { [section]: "approved" } as any,
      });
    }
    toast.success(`${section} approved`);
  }

  async function saveTitle() {
    await updateContent({ id: lessonId, title });
    toast.success("Title saved");
  }

  function handleNotesBlur() {
    saveTeacherNotes({ id: lessonId, teacherNotes: notes }).catch(() => {});
  }

  // Flashcard helpers removed — flashcards auto-generated from vocab on publish
  
  // Vocab helpers
  function addVocabWord() {
    setEditableVocab([
      ...editableVocab,
      { word: "", translation: "", translationLocale: "ru", partOfSpeech: "" },
    ]);
    setVocabDirty(true);
  }

  function updateVocabWord(idx: number, field: string, value: string) {
    const next = [...editableVocab];
    next[idx] = { ...next[idx], [field]: value };
    setEditableVocab(next);
    setVocabDirty(true);
  }

  function removeVocabWord(idx: number) {
    setEditableVocab(editableVocab.filter((_, i) => i !== idx));
    setVocabDirty(true);
  }

  async function saveVocab() {
    const items = editableVocab.map((v) => ({
      word: v.word || "",
      translation: v.translation || "",
      translationLocale: (v.translationLocale || "ru") as "en" | "ru" | "ar",
      partOfSpeech: v.partOfSpeech || "",
      exampleSentence: v.exampleSentence,
      ipa: v.ipa,
    }));
    await replaceVocab({ lessonId, items });
    setVocabDirty(false);
    toast.success("Vocabulary saved");
  }

  async function handleDelete() {
    setDeleteOpen(false);
    await softDelete({ id: lessonId });
    toast.success("Deleted");
    router.push("/teacher/sessions");
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => router.push("/teacher/sessions")}
      >
        <ArrowLeft size={14} className="me-1" /> All sessions
      </Button>

      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="flex-1">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitle}
            className="text-2xl font-bold border-0 px-0 focus-visible:ring-0"
            style={{ background: "transparent" }}
          />
          <div
            className="mt-1 flex items-center gap-2 text-xs"
            style={{ color: "var(--omnic-gray-500)" }}
          >
            <StatusPill status={lesson.status} />
            <span>·</span>
            <span>{Math.round(lesson.durationSeconds / 60)} min</span>
            <span>·</span>
            <span>Created {new Date(lesson.createdAt).toLocaleString()}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(lesson.status === "scheduled" || lesson.status === "recording") && (
            <Button
              onClick={() => router.push(`/teacher/sessions/${id}/live`)}
              style={{ background: "var(--brand-purple)" }}
            >
              <Play size={14} className="me-1" />
              {isLive ? "Return to Live" : "Go Live"}
            </Button>
          )}
          {lesson.status === "published" ? (
            <Button
              variant="outline"
              onClick={() => reopen({ id: lessonId }).then(() => toast.success("Reopened"))}
            >
              <RotateCcw size={14} className="me-1" /> Reopen
            </Button>
          ) : (
            <Button
              disabled={!allApproved}
              onClick={() => publish({ id: lessonId }).then(() => toast.success("Published"))}
            >
              <Send size={14} className="me-1" /> Publish
            </Button>
          )}
          <Button
            variant="outline"
            onClick={() =>
              markNoShow({ id: lessonId, by: "student" }).then(() =>
                toast.success("Marked as student no-show")
              )
            }
          >
            <UserX size={14} className="me-1" /> No-show
          </Button>
          <Button
            variant="outline"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="transcript" className="mt-6">
        <TabsList>
          <TabsTrigger value="transcript">Transcript & Notes</TabsTrigger>
          <TabsTrigger value="summary">
            Summary <StatusBadge s={lesson.contentStatus.summary} />
          </TabsTrigger>
          <TabsTrigger value="vocabulary">
            Vocabulary <StatusBadge s={lesson.contentStatus.vocabulary} />
          </TabsTrigger>
          <TabsTrigger value="homework">
            Homework <StatusBadge s={homework?.status === "reviewed" ? "approved" : homework?.status === "draft" ? "pending" : "review"} />
          </TabsTrigger>
        </TabsList>

        {/* Transcript + Notes */}
        <TabsContent value="transcript" className="mt-3 space-y-3">
          <div
            className="rounded-lg border bg-white p-5"
            style={{ borderColor: "var(--omnic-gray-100)" }}
          >
            <h3 className="font-semibold mb-3">Transcript</h3>
            {lesson.transcript ? (
              <pre
                className="whitespace-pre-wrap text-sm"
                style={{ color: "var(--omnic-gray-800)" }}
              >
                {lesson.transcript}
              </pre>
            ) : (
              <p className="text-sm text-zinc-500">No transcript yet.</p>
            )}
          </div>
          <div
            className="rounded-lg border bg-white p-5"
            style={{ borderColor: "var(--omnic-gray-100)" }}
          >
            <div className="flex items-center gap-2 mb-3">
              <StickyNote size={14} style={{ color: "var(--brand-purple)" }} />
              <h3 className="font-semibold">Teacher Notes</h3>
              <span className="text-xs" style={{ color: "var(--omnic-gray-400)" }}>
                (included in AI generation)
              </span>
            </div>
            <Textarea
              rows={8}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={handleNotesBlur}
              placeholder="Observations, vocabulary to highlight, student mistakes, follow-up ideas…"
            />
          </div>
        </TabsContent>

        {/* Summary */}
        <TabsContent value="summary" className="mt-3">
          <SectionCard
            title="Summary"
            status={lesson.contentStatus.summary}
            generating={generating === "summary"}
            onRegenerate={() => generateSection("summary")}
            onApprove={() => approve("summary")}
          >
            <Textarea
              rows={10}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              onBlur={() => updateContent({ id: lessonId, summary })}
            />
          </SectionCard>
        </TabsContent>

        {/* Vocabulary */}
        <TabsContent value="vocabulary" className="mt-3">
          <SectionCard
            title="Vocabulary"
            status={lesson.contentStatus.vocabulary}
            generating={generating === "vocabulary"}
            onRegenerate={() => generateSection("vocabulary")}
            onApprove={() => approve("vocabulary")}
          >
            {editableVocab.length === 0 && (
              <p className="text-sm text-zinc-500 pb-2">
                No words yet. Regenerate or add manually.
              </p>
            )}
            <table className="w-full text-sm">
              <thead style={{ color: "var(--omnic-gray-500)" }}>
                <tr className="text-left">
                  <th className="py-1.5 w-[22%]">Word</th>
                  <th className="w-[28%]">Translation</th>
                  <th className="w-[12%]">Locale</th>
                  <th className="w-[18%]">POS</th>
                  <th className="w-[14%]">IPA</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {editableVocab.map((v, i) => (
                  <tr
                    key={i}
                    className="border-t"
                    style={{ borderColor: "var(--omnic-gray-100)" }}
                  >
                    <td className="py-1 pe-1">
                      <input
                        value={v.word}
                        onChange={(e) => updateVocabWord(i, "word", e.target.value)}
                        className="w-full text-sm border rounded px-1.5 py-0.5"
                      />
                    </td>
                    <td className="py-1 pe-1">
                      <input
                        value={v.translation}
                        onChange={(e) => updateVocabWord(i, "translation", e.target.value)}
                        className="w-full text-sm border rounded px-1.5 py-0.5"
                      />
                    </td>
                    <td className="py-1 pe-1">
                      <select
                        value={v.translationLocale}
                        onChange={(e) => updateVocabWord(i, "translationLocale", e.target.value)}
                        className="w-full text-sm border rounded px-1 py-0.5"
                      >
                        <option value="ru">RU</option>
                        <option value="ar">AR</option>
                        <option value="en">EN</option>
                      </select>
                    </td>
                    <td className="py-1 pe-1">
                      <input
                        value={v.partOfSpeech}
                        onChange={(e) => updateVocabWord(i, "partOfSpeech", e.target.value)}
                        className="w-full text-sm border rounded px-1.5 py-0.5"
                      />
                    </td>
                    <td className="py-1 pe-1">
                      <input
                        value={v.ipa ?? ""}
                        onChange={(e) => updateVocabWord(i, "ipa", e.target.value)}
                        className="w-full text-sm border rounded px-1.5 py-0.5"
                      />
                    </td>
                    <td className="py-1">
                      <button onClick={() => removeVocabWord(i)}>
                        <X size={14} style={{ color: "var(--omnic-gray-400)" }} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="flex gap-2 mt-3">
              <Button variant="outline" size="sm" onClick={addVocabWord}>
                <Plus size={14} className="me-1" /> Add word
              </Button>
              {vocabDirty && (
                <Button size="sm" onClick={saveVocab}>
                  Save changes
                </Button>
              )}
            </div>
          </SectionCard>
        </TabsContent>

        {/* Homework (merged Quiz + Homework) */}
        <TabsContent value="homework" className="mt-3">
          <TeacherHomeworkTab
            lessonId={lessonId}
            studentId={lesson.studentId}
            transcript={transcriptWithNotes}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete this session?</DialogTitle></DialogHeader>
          <p className="text-sm" style={{ color: "var(--omnic-gray-600)" }}>
            This will soft-delete the session. It can be restored by an admin.
          </p>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button onClick={handleDelete} style={{ background: "var(--omnic-red)" }}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ s }: { s: string }) {
  const map: Record<string, string> = {
    pending: "var(--omnic-gray-300)",
    generating: "var(--status-paused)",
    review: "var(--status-trial)",
    approved: "var(--status-active)",
  };
  return (
    <span
      className="ms-2 inline-block w-2 h-2 rounded-full"
      style={{ background: map[s] ?? "var(--omnic-gray-300)" }}
    />
  );
}

function SectionCard({
  title,
  status,
  generating,
  onRegenerate,
  onApprove,
  children,
}: {
  title: string;
  status: string;
  generating: boolean;
  onRegenerate: () => void;
  onApprove: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="rounded-lg border bg-white p-5 space-y-3"
      style={{ borderColor: "var(--omnic-gray-100)" }}
    >
      <div className="flex justify-between items-center">
        <h3 className="font-semibold">{title}</h3>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onRegenerate}
            disabled={generating}
          >
            {generating ? (
              <Loader2 size={14} className="me-1 animate-spin" />
            ) : (
              <Sparkles size={14} className="me-1" />
            )}
            Regenerate
          </Button>
          <Button
            size="sm"
            onClick={onApprove}
            disabled={status === "approved"}
          >
            <CheckCircle2 size={14} className="me-1" /> Approve
          </Button>
        </div>
      </div>
      {children}
    </div>
  );
}

function parseJsonArray(raw: string): any[] {
  if (!raw) return [];
  let txt = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = txt.indexOf("[");
  if (start >= 0) txt = txt.slice(start);
  try {
    const parsed = JSON.parse(txt);
    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.items)) return parsed.items;
    if (Array.isArray(parsed.questions)) return parsed.questions;
  } catch {}
  return [];
}

// ── Homework tab (merged Quiz) ──────────────────────────────────

function TeacherHomeworkTab({
  lessonId,
  studentId,
  transcript,
}: {
  lessonId: Id<"lessons">;
  studentId: string;
  transcript: string;
}) {
  const list = useQuery(api.homework.listForLesson, { lessonId }) ?? [];
  const create = useMutation(api.homework.create);
  const updateContentMut = useMutation(api.homework.updateContent);
  const review = useMutation(api.homework.review);
  const assignMut = useMutation(api.homework.assign);
  const generate = useAction(api.homeworkAi.generateFromLesson);
  const generateQuiz = useAction(api.homeworkAi.generateQuizContent);

  const [reviewComment, setReviewComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [quizBusy, setQuizBusy] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [model, setModel] = useState(() => {
    if (typeof window !== "undefined") return localStorage.getItem("omnic-homework-model") || "google/gemini-2.5-flash";
    return "google/gemini-2.5-flash";
  });
  const current = list[0];
  const createdRef = useRef(false);

  // The teacher grades on a local copy so per-item marks aren't autosaved
  // over the student's submission until the teacher commits the review.
  const [gradedDoc, setGradedDoc] = useState<unknown>(null);
  useEffect(() => {
    if (current?.status === "submitted") setGradedDoc(current.contentJson);
    else setGradedDoc(null);
  }, [current?._id, current?.status, current?.contentJson]);

  useEffect(() => {
    if (!current && !createdRef.current && studentId) {
      createdRef.current = true;
      create({ studentId, lessonId, title: "Lesson homework" }).catch(() => {});
    }
  }, [current, create, studentId, lessonId]);

  function handleModelChange(value: string) {
    setModel(value);
    localStorage.setItem("omnic-homework-model", value);
  }

  async function handleGenerate() {
    if (!current) return;
    setBusy(true);
    try {
      await generate({ homeworkId: current._id, lessonId, model });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGenerateQuiz() {
    if (!current || !transcript.trim()) {
      toast.error("No transcript to generate from");
      return;
    }
    setQuizBusy(true);
    try {
      await generateQuiz({ homeworkId: current._id, lessonId, model });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setQuizBusy(false);
    }
  }

  async function handleReview() {
    if (!current) return;
    setReviewing(true);
    try {
      const doc = gradedDoc ?? current.contentJson;
      const s = scoreDoc(doc);
      await review({
        id: current._id,
        comment: reviewComment || undefined,
        contentJson: doc,
        score: s.correct,
        maxScore: s.total,
      });
      toast.success("Reviewed — the student can see their result now");
      setReviewComment("");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setReviewing(false);
    }
  }

  async function handleAssign() {
    if (!current) return;
    try {
      await assignMut({ id: current._id });
      toast.success("Assigned — it's on the student's Study page now");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  // Draft autosave (author mode). Debounced so typing stays smooth.
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  function handleEditorChange(json: unknown) {
    if (!current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      updateContentMut({ id: current._id, contentJson: json }).catch(() => {});
    }, 800);
  }
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  if (!current) {
    return (
      <div className="rounded-lg border bg-white p-6 text-center" style={{ borderColor: "var(--omnic-gray-100)" }}>
        <Loader2 size={18} className="mx-auto mb-2 animate-spin" style={{ color: "var(--brand-purple)" }} />
        <p className="text-sm" style={{ color: "var(--omnic-gray-500)" }}>Loading homework…</p>
      </div>
    );
  }

  const status = current.status;
  const statusLabel: Record<string, string> = {
    draft: "Draft — not sent yet",
    assigned: "Assigned — waiting for the student",
    in_progress: "Student is working on it",
    submitted: "Submitted — ready to review",
    reviewed: "Reviewed",
  };

  // ── Draft: author the worksheet ────────────────────────────────
  if (status === "draft") {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border bg-white p-3 flex gap-2 flex-wrap items-center" style={{ borderColor: "var(--omnic-gray-100)" }}>
          <div className="text-xs font-semibold me-1" style={{ color: "var(--omnic-gray-500)" }}>AI draft</div>
          <select
            value={model}
            onChange={(e) => handleModelChange(e.target.value)}
            className="text-xs border rounded px-2 py-1.5"
            style={{ borderColor: "var(--omnic-gray-300)", minWidth: 170 }}
          >
            <option value="google/gemini-2.5-flash">Gemini 2.5 Flash</option>
            <option value="google/gemini-2.5-pro">Gemini 2.5 Pro</option>
            <option value="openai/gpt-4o-mini">GPT-4o Mini</option>
            <option value="openai/gpt-4o">GPT-4o</option>
            <option value="anthropic/claude-3.5-haiku">Claude 3.5 Haiku</option>
            <option value="anthropic/claude-3.5-sonnet">Claude 3.5 Sonnet</option>
          </select>
          <button className="btn btn-secondary btn-sm" onClick={handleGenerate} disabled={busy || !transcript.trim()}>
            <Sparkles size={13} className="me-1" />{busy ? "Generating…" : "Exercises"}
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleGenerateQuiz} disabled={quizBusy || !transcript.trim()}>
            <Sparkles size={13} className="me-1" />{quizBusy ? "Generating…" : "Quiz"}
          </button>
          <div className="ms-auto">
            <button className="btn btn-tenant btn-sm" onClick={handleAssign}>
              <CheckCircle2 size={13} className="me-1" /> Assign to student
            </button>
          </div>
        </div>
        <p className="text-xs" style={{ color: "var(--omnic-gray-500)" }}>
          Build the worksheet by hand with the toolbar (headings, blanks, multiple
          choice, short/essay answers) or start from an AI draft, then assign.
        </p>
        <HomeworkEditor contentJson={current.contentJson} mode="teacher" onChange={handleEditorChange} />
      </div>
    );
  }

  // ── Submitted: grade it ────────────────────────────────────────
  if (status === "submitted") {
    const s = scoreDoc(gradedDoc ?? current.contentJson);
    return (
      <div className="space-y-3">
        <div className="rounded-lg border bg-white p-3 flex items-center gap-3 flex-wrap" style={{ borderColor: "var(--omnic-gray-100)" }}>
          <span className="pill pill-tenant" style={{ fontSize: 11 }}>{statusLabel[status]}</span>
          <span className="text-sm" style={{ color: "var(--omnic-gray-700)" }}>
            Auto score: <b>{s.correct}</b> / {s.total}
            {s.percent !== null ? ` · ${s.percent}%` : ""}
            {s.open > 0 ? ` · ${s.open} to grade by hand` : ""}
          </span>
          <button className="btn btn-tenant btn-sm ms-auto" onClick={handleReview} disabled={reviewing}>
            <CheckCircle2 size={13} className="me-1" />{reviewing ? "Saving…" : "Finish review"}
          </button>
        </div>
        <p className="text-xs" style={{ color: "var(--omnic-gray-500)" }}>
          Objective answers are graded automatically — use the ✓ / ✗ buttons to
          override or to grade open answers. The student sees the result after you finish.
        </p>
        <HomeworkEditor contentJson={current.contentJson} mode="review" onChange={setGradedDoc} />
        <div className="rounded-lg border bg-white p-3" style={{ borderColor: "var(--omnic-gray-100)" }}>
          <div className="text-sm font-semibold mb-2">Overall feedback (optional)</div>
          <Textarea rows={3} placeholder="A note for the student" value={reviewComment} onChange={(e) => setReviewComment(e.target.value)} />
        </div>
      </div>
    );
  }

  // ── Assigned / in-progress / reviewed: read-only view ──────────
  return (
    <div className="space-y-3">
      <div className="rounded-lg border bg-white p-3 flex items-center gap-3 flex-wrap" style={{ borderColor: "var(--omnic-gray-100)" }}>
        <span className="pill pill-tenant" style={{ fontSize: 11 }}>{statusLabel[status] ?? status}</span>
        {status === "reviewed" && current.maxScore ? (
          <span className="text-sm" style={{ color: "var(--omnic-gray-700)" }}>
            Score: <b>{current.score ?? 0}</b> / {current.maxScore}
          </span>
        ) : null}
      </div>
      <HomeworkEditor contentJson={current.contentJson} mode="readonly" onChange={() => {}} />
      {status === "reviewed" && current.teacherComment && (
        <div className="rounded-lg p-3 bg-green-50 text-green-900 text-sm">
          <strong>Your feedback:</strong> {current.teacherComment}
        </div>
      )}
    </div>
  );
}
