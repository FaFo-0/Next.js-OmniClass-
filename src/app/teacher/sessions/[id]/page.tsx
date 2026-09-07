"use client";

// Session review page.
//
// Tabs: Transcript + Notes, Summary, Vocabulary, Flashcards, Homework.
// Quiz merged into Homework. Teacher Notes editable inline and included
// in AI prompts. All sections manually editable. No "Generate All."

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAction, useMutation } from "convex/react";
import { useQuery } from "convex-helpers/react/cache/hooks";
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
  const utterances = useQuery(api.lessons.listTranscriptUtterances, { lessonId }) ?? [];
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
  const ensureUtterances = useMutation(api.lessons.ensureTranscriptUtterances);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [notes, setNotes] = useState("");
  const [generating, setGenerating] = useState<Section | null>(null);
  const [preparingTranscript, setPreparingTranscript] = useState(false);
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

  // Vocabulary extraction gets stable utterance IDs. The model may choose an
  // ID, but the server later verifies the phrase against that utterance and
  // copies the recorded context itself.
  const vocabularyExtractionSource = [
    utterances
      .map((u) =>
        `[${u.utteranceId}${u.speaker ? ` · ${u.speaker}` : ""}]: ${u.text}`
      )
      .join("\n\n"),
    notes.trim() ? `--- Teacher Notes (guidance only; not student context) ---\n${notes.trim()}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

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
    // TEACHER-REVIEW INVARIANT: the transcript text may be persisted while
    // utterance rows are still missing (upload/interrupted-capture modes).
    // Normalize first — the manual-add message is only for a lesson with NO
    // transcript at all.
    let vocabSource = vocabularyExtractionSource;
    if (section === "vocabulary" && utterances.length === 0) {
      if (!lesson?.transcript?.trim()) {
        toast.error("This recording has no structured transcript yet. Add vocabulary manually instead.");
        return;
      }
      setPreparingTranscript(true);
      try {
        const res = await ensureUtterances({ id: lessonId });
        if (res.normalized && res.utterances) {
          vocabSource = res.utterances
            .map((u) => `[${u.utteranceId}]: ${u.text}`)
            .join("\n\n");
        } else if (res.reason !== "already-normalized") {
          toast.error("Couldn't prepare the transcript structure — try again in a moment.");
          setPreparingTranscript(false);
          return;
        }
      } catch {
        toast.error("Couldn't prepare the transcript structure — try again in a moment.");
        setPreparingTranscript(false);
        return;
      } finally {
        setPreparingTranscript(false);
      }
    }
    const source =
      section === "vocabulary" ? vocabSource : transcriptWithNotes;
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
        const generated = parseJsonArray(content);
        if (generated.length === 0) {
          throw new Error("Vocabulary generation returned no usable suggestions. Your reviewed vocabulary was not changed.");
        }
        if (generated.some((it) => typeof it.word !== "string" || !it.word.trim() || typeof it.utteranceId !== "string" || !it.utteranceId.trim())) {
          throw new Error("Vocabulary generation did not identify the recorded sentence for every suggestion. Please try again.");
        }
        const items = generated.map((it) => ({
          word: typeof it.word === "string" ? it.word : typeof it.term === "string" ? it.term : "",
          lemma: typeof it.lemma === "string" ? it.lemma : undefined,
          translation: typeof it.translation === "string" ? it.translation : "",
          definition: typeof it.definition === "string" ? it.definition : "",
          senseLabel: typeof it.senseLabel === "string" ? it.senseLabel : undefined,
          translationLocale: (it.translationLocale === "en" || it.translationLocale === "ar" || it.translationLocale === "ru"
            ? it.translationLocale
            : "ru") as "en" | "ru" | "ar",
          partOfSpeech: typeof it.partOfSpeech === "string" ? it.partOfSpeech : undefined,
          utteranceId: typeof it.utteranceId === "string" ? it.utteranceId.trim() : "",
          included: it.included !== false,
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
      { word: "", lemma: "", translation: "", definition: "", senseLabel: "", translationLocale: "ru", partOfSpeech: "" },
    ]);
    setVocabDirty(true);
  }

  function updateVocabWord(idx: number, field: string, value: unknown) {
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
      lemma: v.lemma || undefined,
      translation: v.translation || "",
      definition: v.definition || "",
      senseLabel: v.senseLabel || undefined,
      translationLocale: (v.translationLocale || "ru") as "en" | "ru" | "ar",
      partOfSpeech: v.partOfSpeech,
      externalId: v.externalId,
      utteranceId: v.utteranceId,
      included: v.included !== false,
      exampleSentence: v.exampleSentence,
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
            Homework <StatusBadge s={homework?.approvedAt || homework?.status !== "draft" ? "approved" : "pending"} />
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
            generating={generating === "vocabulary" || preparingTranscript}
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
                  <th className="py-1.5 w-[20%]">Word</th>
                  <th className="w-[22%]">Translation</th>
                  <th className="w-[50%]">Meaning and recorded context</th>
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
                        placeholder="surface form"
                      />
                      <input
                        value={v.lemma ?? ""}
                        onChange={(e) => updateVocabWord(i, "lemma", e.target.value)}
                        placeholder="lemma / phrase"
                        className="mt-1 w-full text-xs border rounded px-1.5 py-0.5"
                      />
                      <input
                        value={v.partOfSpeech ?? ""}
                        onChange={(e) => updateVocabWord(i, "partOfSpeech", e.target.value)}
                        placeholder="part of speech"
                        className="mt-1 w-full text-xs border rounded px-1.5 py-0.5"
                      />
                      <label className="mt-1 flex items-center gap-1 text-xs text-zinc-500">
                        <input
                          type="checkbox"
                          checked={v.included !== false}
                          onChange={(e) => updateVocabWord(i, "included", e.target.checked)}
                        />
                        Send to student
                      </label>
                    </td>
                    <td className="py-1 pe-1">
                      <input
                        value={v.translation}
                        onChange={(e) => updateVocabWord(i, "translation", e.target.value)}
                        className="w-full text-sm border rounded px-1.5 py-0.5"
                      />
                    </td>
                    <td className="py-1 pe-1 align-top">
                      <input
                        value={v.definition ?? ""}
                        onChange={(e) => updateVocabWord(i, "definition", e.target.value)}
                        placeholder="short English meaning"
                        className="w-full text-sm border rounded px-1.5 py-0.5"
                      />
                      <input
                        value={v.senseLabel ?? ""}
                        onChange={(e) => updateVocabWord(i, "senseLabel", e.target.value)}
                        placeholder="contextual sense label"
                        className="mt-1 w-full text-xs border rounded px-1.5 py-0.5"
                      />
                      <select
                        value={v.utteranceId ?? ""}
                        onChange={(e) => updateVocabWord(i, "utteranceId", e.target.value || undefined)}
                        className="mt-1 w-full text-xs border rounded px-1.5 py-0.5"
                      >
                        {!v.utteranceId && (
                          <option value="">Teacher-added context (no recording link)</option>
                        )}
                        {utterances.map((utterance) => (
                          <option key={utterance.utteranceId} value={utterance.utteranceId}>
                            {typeof utterance.startMs === "number" ? formatTimestamp(utterance.startMs) : "No timestamp"} · {utterance.speaker ?? "Speaker"} · {utterance.text.slice(0, 80)}
                          </option>
                        ))}
                      </select>
                      {v.utteranceId ? (
                        <div className="mt-1.5 rounded bg-zinc-50 px-2 py-1.5 text-xs text-zinc-600">
                          <div className="font-medium text-zinc-700">
                            Recorded {v.sourceSpeaker ? `· ${v.sourceSpeaker}` : ""}
                            {typeof v.sourceStartMs === "number" ? ` · ${formatTimestamp(v.sourceStartMs)}` : ""}
                          </div>
                          <div className="mt-0.5 italic">“{v.exampleSentence}”</div>
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-zinc-500">Teacher-added context</div>
                      )}
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

function formatTimestamp(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonArray(raw: string): JsonRecord[] {
  if (!raw) return [];
  let txt = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = txt.indexOf("[");
  if (start >= 0) txt = txt.slice(start);
  try {
    const parsed: unknown = JSON.parse(txt);
    const values = Array.isArray(parsed)
      ? parsed
      : isJsonRecord(parsed) && Array.isArray(parsed.items)
        ? parsed.items
        : isJsonRecord(parsed) && Array.isArray(parsed.questions)
          ? parsed.questions
          : [];
    return values.filter(isJsonRecord);
  } catch {
    return [];
  }
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
  const setApproved = useMutation(api.homework.setApproved);
  const setDueDate = useMutation(api.homework.setDueDate);
  // Empty = "use the student's next lesson", which is what POLICY §10 means
  // by a deadline. A teacher only picks a date to override that.
  const [dueDraft, setDueDraft] = useState("");
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

  /** Approve = ready to go out with Publish, like summary and vocabulary. */
  async function handleApprove() {
    if (!current) return;
    try {
      if (dueDraft) {
        await setDueDate({ id: current._id, dueAt: new Date(dueDraft).toISOString() });
      }
      await setApproved({ id: current._id, approved: !current.approvedAt });
      toast.success(
        current.approvedAt
          ? "Un-approved — it won't go out with Publish"
          : "Approved — it goes to the student when you publish the lesson"
      );
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  /** Change the deadline after the fact, from the assigned/working states. */
  async function handleChangeDue(value: string) {
    if (!current) return;
    try {
      await setDueDate({
        id: current._id,
        dueAt: value ? new Date(value).toISOString() : null,
      });
      toast.success(value ? "Due date updated" : "Due date cleared");
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
          <div className="ms-auto flex items-center gap-2">
            <label className="text-xs" style={{ color: "var(--omnic-gray-500)" }} htmlFor="hw-due">
              Due
            </label>
            <input
              id="hw-due"
              type="datetime-local"
              value={dueDraft}
              onChange={(e) => setDueDraft(e.target.value)}
              className="text-xs border rounded px-2 py-1.5"
              style={{ borderColor: "var(--omnic-gray-300)" }}
              title="Leave empty to use the student's next lesson"
            />
            <button
              className={current.approvedAt ? "btn btn-secondary btn-sm" : "btn btn-tenant btn-sm"}
              onClick={handleApprove}
            >
              <CheckCircle2 size={13} className="me-1" />
              {current.approvedAt ? "Approved" : "Approve"}
            </button>
          </div>
        </div>
        <p className="text-xs" style={{ color: "var(--omnic-gray-500)" }}>
          {current.approvedAt
            ? "Approved — it goes to the student when you publish the lesson."
            : "Approve it and it goes out with Publish, alongside the summary and vocabulary."}
          {" "}Leave the due date empty and it lands on the student&apos;s next lesson —
          which is when you&apos;ll be checking it anyway.
          <br />
          Build the worksheet by hand with the toolbar (headings, blanks, multiple
          choice, short/essay answers) or start from an AI draft, then assign.
        </p>
        <HomeworkEditor documentId={current._id} contentJson={current.contentJson} mode="teacher" onChange={handleEditorChange} />
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
        <HomeworkEditor documentId={current._id} contentJson={current.contentJson} mode="review" onChange={setGradedDoc} />
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
        {(status === "assigned" || status === "in_progress") && (
          <div className="ms-auto flex items-center gap-2">
            <label className="text-xs" style={{ color: "var(--omnic-gray-500)" }} htmlFor="hw-due-edit">
              Due
            </label>
            <input
              id="hw-due-edit"
              type="datetime-local"
              // Stored as an instant; the picker wants local wall time.
              defaultValue={
                current.dueAt
                  ? new Date(
                      new Date(current.dueAt).getTime() -
                        new Date().getTimezoneOffset() * 60000
                    )
                      .toISOString()
                      .slice(0, 16)
                  : ""
              }
              onChange={(e) => void handleChangeDue(e.target.value)}
              className="text-xs border rounded px-2 py-1.5"
              style={{ borderColor: "var(--omnic-gray-300)" }}
              title="Clear to remove the deadline"
            />
          </div>
        )}
      </div>
      <HomeworkEditor documentId={current._id} contentJson={current.contentJson} mode="readonly" onChange={() => {}} />
      {status === "reviewed" && current.teacherComment && (
        <div className="rounded-lg p-3 bg-green-50 text-green-900 text-sm">
          <strong>Your feedback:</strong> {current.teacherComment}
        </div>
      )}
    </div>
  );
}
