"use client";

// Session review page. Lesson lifecycle: transcribed → review →
// published. Teacher edits transcript-derived sections (summary,
// vocab, flashcards, quiz), regenerates per-section via OpenRouter,
// approves, then publishes.
//
// AI generation is hand-rolled here using existing api.ai.generate
// action + api.lessonContent.replace* mutations. Phase H polish can
// extract this into a shared hook.

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import {
  ArrowLeft,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Send,
  Sparkles,
  Trash2,
  UserX,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusPill } from "@/components/shared/StatusPill";
import { toast } from "sonner";

type Section = "summary" | "vocabulary" | "flashcards" | "quiz";

interface PromptConfig {
  configId: string;
  systemPrompt: string;
  userPromptTemplate: string;
  model: string;
  temperature: number;
  maxTokens: number;
}

const SECTION_TO_PROMPT: Record<Section, string> = {
  summary: "lesson_summary",
  vocabulary: "vocab_extraction",
  flashcards: "flashcard_generation",
  quiz: "quiz_generation",
};

export default function SessionReviewPage() {
  const { id } = useParams<{ id: string }>();
  const lessonId = id as Id<"lessons">;
  const router = useRouter();

  const lesson = useQuery(api.lessons.get, { id: lessonId });
  const vocab = useQuery(api.lessonContent.listVocab, { lessonId }) ?? [];
  const flashcards =
    useQuery(api.lessonContent.listFlashcards, { lessonId }) ?? [];
  const quiz = useQuery(api.lessonContent.listQuiz, { lessonId }) ?? [];
  const promptConfigs = useQuery(api.promptConfigs.listForOrg) ?? [];

  const updateContent = useMutation(api.lessons.updateContent);
  const replaceVocab = useMutation(api.lessonContent.replaceVocab);
  const replaceFlashcards = useMutation(api.lessonContent.replaceFlashcards);
  const replaceQuiz = useMutation(api.lessonContent.replaceQuiz);
  const publish = useMutation(api.lessons.publish);
  const reopen = useMutation(api.lessons.reopen);
  const softDelete = useMutation(api.lessons.softDelete);
  const markNoShow = useMutation(api.lessons.markNoShow);
  const aiGenerate = useAction(api.ai.generate);

  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [generating, setGenerating] = useState<Section | null>(null);

  useEffect(() => {
    if (!lesson) return;
    setTitle(lesson.title);
    setSummary(lesson.summary);
  }, [lesson]);

  if (lesson === undefined) {
    return <div className="p-12 text-center text-zinc-500">Loading…</div>;
  }
  if (lesson === null) return <div className="p-6">Not found.</div>;

  const allApproved =
    lesson.contentStatus.summary === "approved" &&
    lesson.contentStatus.vocabulary === "approved" &&
    lesson.contentStatus.flashcards === "approved" &&
    lesson.contentStatus.quiz === "approved";

  function findPrompt(configId: string): PromptConfig | null {
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
    if (!lesson || !lesson.transcript.trim()) {
      toast.error("No transcript to generate from");
      return;
    }

    setGenerating(section);
    try {
      // Mark generating
      await updateContent({
        id: lessonId,
        contentStatusPatch: { [section]: "generating" } as any,
      });

      const { content } = await aiGenerate({
        promptConfigId: cfg.configId,
        transcript: lesson.transcript,
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
          translationLocale: (it.translationLocale ?? "ru") as
            | "en"
            | "ru"
            | "ar",
          partOfSpeech: it.partOfSpeech ?? "",
          exampleSentence: it.exampleSentence,
          ipa: it.ipa,
          audioUrl: it.audioUrl,
        }));
        await replaceVocab({ lessonId, items });
        await updateContent({
          id: lessonId,
          contentStatusPatch: { vocabulary: "review" } as any,
        });
      } else if (section === "flashcards") {
        const items = parseJsonArray(content).map((it: any) => ({
          front: it.front ?? "",
          back: it.back ?? "",
          exampleSentence: it.exampleSentence,
        }));
        await replaceFlashcards({ lessonId, items });
        await updateContent({
          id: lessonId,
          contentStatusPatch: { flashcards: "review" } as any,
        });
      } else if (section === "quiz") {
        const items = parseJsonArray(content).map((it: any) => ({
          question: it.question ?? "",
          options: Array.isArray(it.options) ? it.options : [],
          correctIndex: typeof it.correctIndex === "number" ? it.correctIndex : 0,
          explanation: it.explanation ?? "",
        }));
        await replaceQuiz({ lessonId, items });
        await updateContent({
          id: lessonId,
          contentStatusPatch: { quiz: "review" } as any,
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

  async function generateAll() {
    for (const s of ["summary", "vocabulary", "flashcards", "quiz"] as Section[]) {
      // eslint-disable-next-line no-await-in-loop
      await generateSection(s);
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
            <span>
              {Math.round(lesson.durationSeconds / 60)} min
            </span>
            <span>·</span>
            <span>Created {new Date(lesson.createdAt).toLocaleString()}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={generateAll}>
            <Sparkles size={14} className="me-1" /> Generate all
          </Button>
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
            onClick={() => {
              if (!confirm("Soft-delete this session?")) return;
              softDelete({ id: lessonId }).then(() => {
                toast.success("Deleted");
                router.push("/teacher/sessions");
              });
            }}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      <Tabs defaultValue="transcript" className="mt-6">
        <TabsList>
          <TabsTrigger value="transcript">Transcript</TabsTrigger>
          <TabsTrigger value="summary">
            Summary <StatusBadge s={lesson.contentStatus.summary} />
          </TabsTrigger>
          <TabsTrigger value="vocabulary">
            Vocabulary <StatusBadge s={lesson.contentStatus.vocabulary} />
          </TabsTrigger>
          <TabsTrigger value="flashcards">
            Flashcards <StatusBadge s={lesson.contentStatus.flashcards} />
          </TabsTrigger>
          <TabsTrigger value="quiz">
            Quiz <StatusBadge s={lesson.contentStatus.quiz} />
          </TabsTrigger>
        </TabsList>

        <TabsContent
          value="transcript"
          className="rounded-lg border bg-white p-5 mt-3"
          style={{ borderColor: "var(--omnic-gray-100)" }}
        >
          {lesson.transcript ? (
            <pre className="whitespace-pre-wrap text-sm" style={{ color: "var(--omnic-gray-800)" }}>
              {lesson.transcript}
            </pre>
          ) : (
            <p className="text-sm text-zinc-500">No transcript yet.</p>
          )}
        </TabsContent>

        <TabsContent value="summary" className="mt-3">
          <SectionCard
            title="Summary"
            section="summary"
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

        <TabsContent value="vocabulary" className="mt-3">
          <SectionCard
            title="Vocabulary"
            section="vocabulary"
            status={lesson.contentStatus.vocabulary}
            generating={generating === "vocabulary"}
            onRegenerate={() => generateSection("vocabulary")}
            onApprove={() => approve("vocabulary")}
          >
            {vocab.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Nothing yet. Click Regenerate to extract.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead style={{ color: "var(--omnic-gray-500)" }}>
                  <tr className="text-left">
                    <th className="py-1.5">Word</th>
                    <th>Translation</th>
                    <th>Locale</th>
                    <th>POS</th>
                  </tr>
                </thead>
                <tbody>
                  {vocab.map((v) => (
                    <tr
                      key={v._id}
                      className="border-t"
                      style={{ borderColor: "var(--omnic-gray-100)" }}
                    >
                      <td className="py-1.5 font-medium">{v.word}</td>
                      <td>{v.translation}</td>
                      <td>{v.translationLocale}</td>
                      <td>{v.partOfSpeech}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="flashcards" className="mt-3">
          <SectionCard
            title="Flashcards"
            section="flashcards"
            status={lesson.contentStatus.flashcards}
            generating={generating === "flashcards"}
            onRegenerate={() => generateSection("flashcards")}
            onApprove={() => approve("flashcards")}
          >
            {flashcards.length === 0 ? (
              <p className="text-sm text-zinc-500">No flashcards yet.</p>
            ) : (
              <ul className="space-y-2 text-sm">
                {flashcards.map((f) => (
                  <li
                    key={f._id}
                    className="rounded border px-3 py-2"
                    style={{ borderColor: "var(--omnic-gray-100)" }}
                  >
                    <div className="font-semibold">{f.front}</div>
                    <div className="text-zinc-600">{f.back}</div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </TabsContent>

        <TabsContent value="quiz" className="mt-3">
          <SectionCard
            title="Quiz"
            section="quiz"
            status={lesson.contentStatus.quiz}
            generating={generating === "quiz"}
            onRegenerate={() => generateSection("quiz")}
            onApprove={() => approve("quiz")}
          >
            {quiz.length === 0 ? (
              <p className="text-sm text-zinc-500">No questions yet.</p>
            ) : (
              <ol className="list-decimal ms-5 space-y-3 text-sm">
                {quiz.map((q) => (
                  <li key={q._id}>
                    <div className="font-medium">{q.question}</div>
                    <ul className="ms-3 mt-1 text-xs space-y-0.5">
                      {q.options.map((o, i) => (
                        <li
                          key={i}
                          className={
                            i === q.correctIndex
                              ? "font-semibold text-green-700"
                              : ""
                          }
                        >
                          {String.fromCharCode(65 + i)}. {o}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ol>
            )}
          </SectionCard>
        </TabsContent>
      </Tabs>
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
  section: Section;
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
