"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex";
import {
  parseVocabulary,
  parseFlashcards,
  parseQuiz,
} from "@/lib/ai/generate";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Markdown } from "@/components/ui/markdown";
import {
  ArrowLeft,
  Send,
  FileText,
  BookOpen,
  Layers,
  HelpCircle,
  RefreshCw,
  Check,
  Pencil,
  Sparkles,
  X,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@convex/dataModel";

type ContentSectionStatus = "pending" | "generating" | "review" | "approved";

interface VocabItem {
  externalId: string;
  arabic: string;
  transliteration: string;
  translation: string;
  partOfSpeech: string;
}

interface FlashcardItem {
  externalId: string;
  front: string;
  back: string;
}

interface QuizItem {
  externalId: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

// --- Status badge helper ---
function StatusBadge({ status }: { status: ContentSectionStatus }) {
  const tStatus = useTranslations("status");
  const config = {
    pending: { label: tStatus("pending"), className: "bg-muted text-muted-foreground" },
    generating: {
      label: tStatus("generating"),
      className: "bg-yellow-100 text-yellow-700 animate-pulse",
    },
    review: {
      label: tStatus("review"),
      className: "bg-yellow-100 text-yellow-700",
    },
    approved: { label: tStatus("approved"), className: "bg-green-100 text-green-700" },
  }[status];

  return (
    <Badge variant="secondary" className={`text-xs ${config.className}`}>
      {config.label}
    </Badge>
  );
}

// --- Section action buttons ---
function SectionActions({
  status,
  onGenerate,
  onApprove,
  onEdit,
  isEditing,
  onCancelEdit,
  generating,
  hasContent = true,
}: {
  status: ContentSectionStatus;
  onGenerate: () => void;
  onApprove: () => void;
  onEdit: () => void;
  isEditing: boolean;
  onCancelEdit: () => void;
  generating: boolean;
  hasContent?: boolean;
}) {
  const t = useTranslations("teacher.lessonReview");
  const tc = useTranslations("common");

  return (
    <div className="flex items-center gap-1.5">
      {(status === "pending" || status === "review" || status === "approved") && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onGenerate}
          disabled={generating}
          className="h-7 gap-1 text-xs"
        >
          <RefreshCw className={`h-3 w-3 ${generating ? "animate-spin" : ""}`} />
          {status === "pending" ? t("generate") : t("regenerate")}
        </Button>
      )}
      {status === "review" && !isEditing && (
        <>
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="h-7 gap-1 text-xs"
          >
            <Pencil className="h-3 w-3" />
            {tc("edit")}
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={onApprove}
            disabled={!hasContent}
            title={!hasContent ? "No content to approve — generate first" : undefined}
            className="h-7 gap-1 text-xs"
          >
            <Check className="h-3 w-3" />
            {t("approve")}
          </Button>
        </>
      )}
      {status === "approved" && !isEditing && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onEdit}
          className="h-7 gap-1 text-xs"
        >
          <Pencil className="h-3 w-3" />
          {tc("edit")}
        </Button>
      )}
      {isEditing && (
        <Button
          variant="ghost"
          size="sm"
          onClick={onCancelEdit}
          className="h-7 gap-1 text-xs"
        >
          <X className="h-3 w-3" />
          {tc("cancel")}
        </Button>
      )}
    </div>
  );
}

// --- Main page ---
export default function LessonReviewPage({
  params,
}: {
  params: Promise<{ lessonId: string }>;
}) {
  const { lessonId } = use(params);
  const router = useRouter();
  const t = useTranslations("teacher.lessonReview");
  const tStatus = useTranslations("status");
  const tc = useTranslations("common");

  // ── Convex queries ──
  const lesson = useQuery(api.lessons.getLesson, { externalId: lessonId });
  const vocabulary = useQuery(
    api.lessonContent.getVocabulary,
    lesson?._id ? { lessonId: lesson._id } : "skip"
  ) ?? [];
  const flashcards = useQuery(
    api.lessonContent.getFlashcards,
    lesson?._id ? { lessonId: lesson._id } : "skip"
  ) ?? [];
  const quiz = useQuery(
    api.lessonContent.getQuizQuestions,
    lesson?._id ? { lessonId: lesson._id } : "skip"
  ) ?? [];
  const student = useQuery(
    api.users.getUser,
    lesson?.studentId ? { externalId: lesson.studentId } : "skip"
  );

  // ── Convex mutations ──
  const updateSummary = useMutation(api.lessons.updateSummary);
  const setContentStatus = useMutation(api.lessons.setContentSectionStatus);
  const publishLessonMut = useMutation(api.lessons.publishLesson);
  const setVocabulary = useMutation(api.lessonContent.setVocabulary);
  const setFlashcards = useMutation(api.lessonContent.setFlashcards);
  const setQuizQuestions = useMutation(api.lessonContent.setQuizQuestions);

  // ── AI action ──
  const generateAI = useAction(api.ai.generate);

  // ── Settings (Convex) ──
  const promptConfigs = useQuery(api.settings.listPromptConfigs) ?? [];

  // ── Editing states ──
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState("");
  const [editingVocab, setEditingVocab] = useState(false);
  const [vocabDraft, setVocabDraft] = useState<VocabItem[]>([]);
  const [editingFlashcards, setEditingFlashcards] = useState(false);
  const [flashcardsDraft, setFlashcardsDraft] = useState<FlashcardItem[]>([]);
  const [editingQuiz, setEditingQuiz] = useState(false);
  const [quizDraft, setQuizDraft] = useState<QuizItem[]>([]);
  const [generatingSection, setGeneratingSection] = useState<string | null>(null);

  // --- Generate single section ---
  type ContentSection = "summary" | "vocabulary" | "flashcards" | "quiz";

  async function handleGenerateSection(section: ContentSection, configId: string) {
    if (!lesson?.transcript || !lesson._id) return;

    const config = promptConfigs.find((p) => p.configId === configId);
    if (!config) {
      toast.error(`Prompt config "${configId}" not found`);
      return;
    }

    setGeneratingSection(section);
    await setContentStatus({ id: lesson._id, section, status: "generating" });

    try {
      const result = await generateAI({
        promptConfigId: configId,
        transcript: lesson.transcript,
        systemPrompt: config.systemPrompt,
        userPromptTemplate: config.userPromptTemplate,
        model: config.model,
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      });

      // Parse and save based on section type
      switch (section) {
        case "summary":
          await updateSummary({ id: lesson._id, summary: result.content });
          break;
        case "vocabulary": {
          const items = parseVocabulary(result.content).map((v, i) => ({
            ...v,
            externalId: `v-${lessonId}-${i}`,
            partOfSpeech: v.partOfSpeech || "noun",
          }));
          if (items.length === 0) {
            toast.warning("Vocabulary generated but parsing returned 0 items — check console");
          }
          await setVocabulary({ lessonId: lesson._id, items });
          break;
        }
        case "flashcards": {
          const items = parseFlashcards(result.content).map((f, i) => ({
            ...f,
            externalId: `f-${lessonId}-${i}`,
          }));
          if (items.length === 0) {
            toast.warning("Flashcards generated but parsing returned 0 items — check console");
          }
          await setFlashcards({ lessonId: lesson._id, items });
          break;
        }
        case "quiz": {
          const items = parseQuiz(result.content).map((q, i) => ({
            ...q,
            externalId: `q-${lessonId}-${i}`,
          }));
          if (items.length === 0) {
            toast.warning("Quiz generated but parsing returned 0 items — check console");
          }
          await setQuizQuestions({ lessonId: lesson._id, items });
          break;
        }
      }

      await setContentStatus({ id: lesson._id, section, status: "review" });
      toast.success(
        t("generated", { section: section.charAt(0).toUpperCase() + section.slice(1) })
      );
    } catch (err) {
      await setContentStatus({ id: lesson._id, section, status: "pending" });
      toast.error(
        t("generateFailed", { section, error: err instanceof Error ? err.message : "Unknown error" })
      );
    } finally {
      setGeneratingSection(null);
    }
  }

  // --- Generate All ---
  async function handleGenerateAll() {
    if (!lesson?.transcript) {
      toast.error(t("noTranscript"));
      return;
    }

    const sections: Array<{ configId: string; section: ContentSection }> = [
      { configId: "lesson_summary", section: "summary" },
      { configId: "vocab_extraction", section: "vocabulary" },
      { configId: "flashcard_generation", section: "flashcards" },
      { configId: "quiz_generation", section: "quiz" },
    ];

    for (const { configId, section } of sections) {
      await handleGenerateSection(section, configId);
    }
  }

  if (!lesson) {
    return (
      <div className="flex flex-col items-center py-20">
        <p className="text-muted-foreground">{t("notFound")}</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => router.push("/teacher")}
        >
          {t("backToDashboard")}
        </Button>
      </div>
    );
  }

  const contentStatus = lesson.contentStatus;

  const allApproved =
    contentStatus.summary === "approved" &&
    contentStatus.vocabulary === "approved" &&
    contentStatus.flashcards === "approved" &&
    contentStatus.quiz === "approved";

  const hasTranscript = lesson.transcript.length > 0;
  const anyPending =
    contentStatus.summary === "pending" ||
    contentStatus.vocabulary === "pending" ||
    contentStatus.flashcards === "pending" ||
    contentStatus.quiz === "pending";

  const handlePublish = async () => {
    if (!allApproved) {
      toast.error(t("approveFirst"));
      return;
    }
    await publishLessonMut({ id: lesson._id });
    toast.success(t("published"));
  };

  // --- Summary edit ---
  const startEditSummary = () => {
    setSummaryDraft(lesson.summary);
    setEditingSummary(true);
  };
  const saveSummary = async () => {
    await updateSummary({ id: lesson._id, summary: summaryDraft });
    setEditingSummary(false);
    await setContentStatus({ id: lesson._id, section: "summary", status: "review" });
  };

  // --- Vocab edit ---
  const startEditVocab = () => {
    setVocabDraft(vocabulary.map((v) => ({
      externalId: v.externalId,
      arabic: v.arabic,
      transliteration: v.transliteration,
      translation: v.translation,
      partOfSpeech: v.partOfSpeech,
    })));
    setEditingVocab(true);
  };
  const saveVocab = async () => {
    await setVocabulary({ lessonId: lesson._id, items: vocabDraft });
    setEditingVocab(false);
    await setContentStatus({ id: lesson._id, section: "vocabulary", status: "review" });
  };

  // --- Flashcard edit ---
  const startEditFlashcards = () => {
    setFlashcardsDraft(flashcards.map((f) => ({
      externalId: f.externalId,
      front: f.front,
      back: f.back,
    })));
    setEditingFlashcards(true);
  };
  const saveFlashcards = async () => {
    await setFlashcards({ lessonId: lesson._id, items: flashcardsDraft });
    setEditingFlashcards(false);
    await setContentStatus({ id: lesson._id, section: "flashcards", status: "review" });
  };

  // --- Quiz edit ---
  const startEditQuiz = () => {
    setQuizDraft(quiz.map((q) => ({
      externalId: q.externalId,
      question: q.question,
      options: [...q.options],
      correctIndex: q.correctIndex,
      explanation: q.explanation,
    })));
    setEditingQuiz(true);
  };
  const saveQuiz = async () => {
    await setQuizQuestions({ lessonId: lesson._id, items: quizDraft });
    setEditingQuiz(false);
    await setContentStatus({ id: lesson._id, section: "quiz", status: "review" });
  };

  const statusColor = {
    recording: "bg-red-100 text-red-700",
    processing: "bg-yellow-100 text-yellow-700",
    review: "bg-blue-100 text-blue-700",
    published: "bg-green-100 text-green-700",
  }[lesson.status];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() =>
              student
                ? router.push(`/teacher/students/${student.externalId}`)
                : router.push("/teacher")
            }
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-xl font-bold">{lesson.title}</h1>
            <p className="text-sm text-muted-foreground">
              {student?.name} &middot;{" "}
              {Math.floor(lesson.durationSeconds / 60)}m{" "}
              {lesson.durationSeconds % 60}s
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="secondary" className={statusColor}>
            {tStatus(lesson.status)}
          </Badge>
          {lesson.status !== "published" && (
            <Button
              onClick={handlePublish}
              disabled={!allApproved}
              className="gap-2"
            >
              <Send className="h-4 w-4" />
              {t("publish")}
            </Button>
          )}
        </div>
      </div>

      {/* Generate All button */}
      {hasTranscript && anyPending && (
        <Button
          variant="outline"
          className="w-full gap-2"
          onClick={handleGenerateAll}
          disabled={generatingSection !== null}
        >
          <Sparkles className="h-4 w-4" />
          {t("generateAll")}
        </Button>
      )}

      {/* Content Sections */}
      <div className="space-y-4">
        {/* Transcript */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              {t("transcript")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {lesson.transcript ? (
              <div className="rounded-lg bg-muted/50 p-4 text-base leading-relaxed">
                {lesson.transcript.split("\n\n").map((block, i) => {
                  const match = block.match(/^\[(.+?)\]:\s*([\s\S]*)$/);
                  if (match) {
                    return (
                      <div key={i} className={i > 0 ? "mt-3" : ""}>
                        <span className="text-xs font-semibold text-primary" dir="ltr">
                          {match[1]}
                        </span>
                        <p dir="rtl" lang="ar" className="mt-0.5">
                          {match[2]}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <p key={i} dir="rtl" lang="ar" className={i > 0 ? "mt-2" : ""}>
                      {block}
                    </p>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                {t("noTranscriptYet")}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Summary */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-4 w-4 text-primary" />
                {t("summary")}
                <StatusBadge status={contentStatus.summary as ContentSectionStatus} />
              </CardTitle>
              <SectionActions
                status={contentStatus.summary as ContentSectionStatus}
                onGenerate={() =>
                  handleGenerateSection("summary", "lesson_summary")
                }
                onApprove={() =>
                  setContentStatus({ id: lesson._id, section: "summary", status: "approved" })
                }
                onEdit={startEditSummary}
                isEditing={editingSummary}
                onCancelEdit={() => setEditingSummary(false)}
                hasContent={!!lesson.summary}
                generating={generatingSection === "summary"}
              />
            </div>
          </CardHeader>
          <CardContent>
            {contentStatus.summary === "generating" ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ) : editingSummary ? (
              <div className="space-y-3">
                <Textarea
                  value={summaryDraft}
                  onChange={(e) => setSummaryDraft(e.target.value)}
                  rows={5}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingSummary(false)}
                  >
                    {tc("cancel")}
                  </Button>
                  <Button size="sm" onClick={saveSummary}>
                    {tc("save")}
                  </Button>
                </div>
              </div>
            ) : lesson.summary ? (
              <Markdown>{lesson.summary}</Markdown>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                {t("clickGenerate", { section: t("summary").toLowerCase() })}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Vocabulary */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="h-4 w-4 text-primary" />
                {t("vocabulary")}
                <StatusBadge status={contentStatus.vocabulary as ContentSectionStatus} />
                {vocabulary.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    ({vocabulary.length})
                  </span>
                )}
              </CardTitle>
              <SectionActions
                status={contentStatus.vocabulary as ContentSectionStatus}
                onGenerate={() =>
                  handleGenerateSection("vocabulary", "vocab_extraction")
                }
                onApprove={() =>
                  setContentStatus({ id: lesson._id, section: "vocabulary", status: "approved" })
                }
                onEdit={startEditVocab}
                isEditing={editingVocab}
                onCancelEdit={() => setEditingVocab(false)}
                hasContent={vocabulary.length > 0}
                generating={generatingSection === "vocabulary"}
              />
            </div>
          </CardHeader>
          <CardContent>
            {contentStatus.vocabulary === "generating" ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : editingVocab ? (
              <div className="space-y-3">
                {vocabDraft.map((v, i) => (
                  <div key={v.externalId} className="flex gap-2 items-center">
                    <Input
                      value={v.arabic}
                      onChange={(e) => {
                        const next = [...vocabDraft];
                        next[i] = { ...next[i], arabic: e.target.value };
                        setVocabDraft(next);
                      }}
                      placeholder="Arabic"
                      className="w-32 text-end"
                      dir="rtl"
                    />
                    <Input
                      value={v.transliteration}
                      onChange={(e) => {
                        const next = [...vocabDraft];
                        next[i] = { ...next[i], transliteration: e.target.value };
                        setVocabDraft(next);
                      }}
                      placeholder="Transliteration"
                      className="flex-1"
                    />
                    <Input
                      value={v.translation}
                      onChange={(e) => {
                        const next = [...vocabDraft];
                        next[i] = { ...next[i], translation: e.target.value };
                        setVocabDraft(next);
                      }}
                      placeholder="Translation"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() =>
                        setVocabDraft(vocabDraft.filter((_, j) => j !== i))
                      }
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setVocabDraft([
                      ...vocabDraft,
                      {
                        externalId: `v-new-${Date.now()}`,
                        arabic: "",
                        transliteration: "",
                        translation: "",
                        partOfSpeech: "noun",
                      },
                    ])
                  }
                  className="gap-1"
                >
                  <Plus className="h-3 w-3" />
                  {t("addWord")}
                </Button>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingVocab(false)}
                  >
                    {tc("cancel")}
                  </Button>
                  <Button size="sm" onClick={saveVocab}>
                    {tc("save")}
                  </Button>
                </div>
              </div>
            ) : vocabulary.length > 0 ? (
              <div className="grid gap-2">
                {vocabulary.map((v) => (
                  <div
                    key={v._id}
                    className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-2"
                  >
                    <span className="text-lg font-medium" dir="rtl" lang="ar">
                      {v.arabic}
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {v.transliteration} — {v.translation}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                {t("clickGenerate", { section: t("vocabulary").toLowerCase() })}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Flashcards */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Layers className="h-4 w-4 text-primary" />
                {t("flashcards")}
                <StatusBadge status={contentStatus.flashcards as ContentSectionStatus} />
                {flashcards.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    ({flashcards.length})
                  </span>
                )}
              </CardTitle>
              <SectionActions
                status={contentStatus.flashcards as ContentSectionStatus}
                onGenerate={() =>
                  handleGenerateSection("flashcards", "flashcard_generation")
                }
                onApprove={() =>
                  setContentStatus({ id: lesson._id, section: "flashcards", status: "approved" })
                }
                onEdit={startEditFlashcards}
                isEditing={editingFlashcards}
                onCancelEdit={() => setEditingFlashcards(false)}
                hasContent={flashcards.length > 0}
                generating={generatingSection === "flashcards"}
              />
            </div>
          </CardHeader>
          <CardContent>
            {contentStatus.flashcards === "generating" ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : editingFlashcards ? (
              <div className="space-y-3">
                {flashcardsDraft.map((f, i) => (
                  <div key={f.externalId} className="flex gap-2 items-center">
                    <Input
                      value={f.front}
                      onChange={(e) => {
                        const next = [...flashcardsDraft];
                        next[i] = { ...next[i], front: e.target.value };
                        setFlashcardsDraft(next);
                      }}
                      placeholder="Front (Arabic)"
                      className="flex-1 text-end"
                      dir="rtl"
                    />
                    <span className="text-muted-foreground">&rarr;</span>
                    <Input
                      value={f.back}
                      onChange={(e) => {
                        const next = [...flashcardsDraft];
                        next[i] = { ...next[i], back: e.target.value };
                        setFlashcardsDraft(next);
                      }}
                      placeholder="Back (Translation)"
                      className="flex-1"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() =>
                        setFlashcardsDraft(
                          flashcardsDraft.filter((_, j) => j !== i)
                        )
                      }
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setFlashcardsDraft([
                      ...flashcardsDraft,
                      { externalId: `f-new-${Date.now()}`, front: "", back: "" },
                    ])
                  }
                  className="gap-1"
                >
                  <Plus className="h-3 w-3" />
                  {t("addCard")}
                </Button>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingFlashcards(false)}
                  >
                    {tc("cancel")}
                  </Button>
                  <Button size="sm" onClick={saveFlashcards}>
                    {tc("save")}
                  </Button>
                </div>
              </div>
            ) : flashcards.length > 0 ? (
              <div className="grid gap-2 sm:grid-cols-2">
                {flashcards.map((f) => (
                  <div
                    key={f._id}
                    className="rounded-lg border bg-card p-3 text-center"
                  >
                    <p className="text-lg font-medium" dir="rtl" lang="ar">
                      {f.front}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {f.back}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                {t("clickGenerate", { section: t("flashcards").toLowerCase() })}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Quiz */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <HelpCircle className="h-4 w-4 text-primary" />
                {t("quiz")}
                <StatusBadge status={contentStatus.quiz as ContentSectionStatus} />
                {quiz.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    ({quiz.length})
                  </span>
                )}
              </CardTitle>
              <SectionActions
                status={contentStatus.quiz as ContentSectionStatus}
                onGenerate={() =>
                  handleGenerateSection("quiz", "quiz_generation")
                }
                onApprove={() =>
                  setContentStatus({ id: lesson._id, section: "quiz", status: "approved" })
                }
                onEdit={startEditQuiz}
                isEditing={editingQuiz}
                onCancelEdit={() => setEditingQuiz(false)}
                generating={generatingSection === "quiz"}
                hasContent={quiz.length > 0}
              />
            </div>
          </CardHeader>
          <CardContent>
            {contentStatus.quiz === "generating" ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-28 w-full" />
                ))}
              </div>
            ) : editingQuiz ? (
              <div className="space-y-4">
                {quizDraft.map((q, qi) => (
                  <div
                    key={q.externalId}
                    className="space-y-2 rounded-lg border p-3"
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-2 text-xs font-bold text-muted-foreground">
                        Q{qi + 1}
                      </span>
                      <Input
                        value={q.question}
                        onChange={(e) => {
                          const next = [...quizDraft];
                          next[qi] = { ...next[qi], question: e.target.value };
                          setQuizDraft(next);
                        }}
                        className="flex-1"
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        onClick={() =>
                          setQuizDraft(quizDraft.filter((_, j) => j !== qi))
                        }
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2 ps-6">
                        <button
                          onClick={() => {
                            const next = [...quizDraft];
                            next[qi] = { ...next[qi], correctIndex: oi };
                            setQuizDraft(next);
                          }}
                          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${
                            q.correctIndex === oi
                              ? "border-primary bg-primary text-primary-foreground"
                              : "border-border"
                          }`}
                        >
                          {String.fromCharCode(65 + oi)}
                        </button>
                        <Input
                          value={opt}
                          onChange={(e) => {
                            const next = [...quizDraft];
                            const opts = [...next[qi].options];
                            opts[oi] = e.target.value;
                            next[qi] = { ...next[qi], options: opts };
                            setQuizDraft(next);
                          }}
                          className="flex-1 h-8 text-sm"
                        />
                      </div>
                    ))}
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setQuizDraft([
                      ...quizDraft,
                      {
                        externalId: `q-new-${Date.now()}`,
                        question: "",
                        options: ["", "", "", ""],
                        correctIndex: 0,
                        explanation: "",
                      },
                    ])
                  }
                  className="gap-1"
                >
                  <Plus className="h-3 w-3" />
                  {t("addQuestion")}
                </Button>
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingQuiz(false)}
                  >
                    {tc("cancel")}
                  </Button>
                  <Button size="sm" onClick={saveQuiz}>
                    {tc("save")}
                  </Button>
                </div>
              </div>
            ) : quiz.length > 0 ? (
              <div className="space-y-3">
                {quiz.map((q, i) => (
                  <div key={q._id} className="rounded-lg bg-muted/50 p-3">
                    <p className="text-sm font-medium">
                      {i + 1}. {q.question}
                    </p>
                    <div className="mt-2 grid gap-1">
                      {q.options.map((opt, j) => (
                        <div
                          key={j}
                          className={`rounded px-3 py-1 text-sm ${
                            j === q.correctIndex
                              ? "bg-primary/10 font-medium text-primary"
                              : "text-muted-foreground"
                          }`}
                        >
                          {String.fromCharCode(65 + j)}. {opt}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground italic">
                {t("clickGenerate", { section: t("quiz").toLowerCase() })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
