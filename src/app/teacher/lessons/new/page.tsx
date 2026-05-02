"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Suspense, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@convex";
import { useAuth } from "@/lib/auth";
import { RecordingPanel } from "@/components/recording/RecordingPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Mic, Upload, Loader2, FileAudio } from "lucide-react";
import { toast } from "sonner";
import type { Id } from "@convex/dataModel";

function NewLessonContent() {
  const router = useRouter();
  const t = useTranslations("teacher.newLesson");
  const searchParams = useSearchParams();
  const studentId = searchParams.get("studentId") ?? "";

  const { currentUserId } = useAuth();
  const currentUser = useQuery(
    api.users.getUser,
    currentUserId ? { externalId: currentUserId } : "skip"
  );
  const student = useQuery(
    api.users.getUser,
    studentId ? { externalId: studentId } : "skip"
  );
  const studentLessons = useQuery(
    api.lessons.getLessonsForStudent,
    studentId ? { studentId } : "skip"
  );
  const existingLessonsCount = useMemo(
    () => studentLessons?.length ?? 0,
    [studentLessons]
  );

  const createLesson = useMutation(api.lessons.createLesson);
  const finalizeTranscript = useMutation(api.lessons.finalizeTranscript);
  const getSonioxKey = useAction(api.soniox.getApiKey);

  const [title, setTitle] = useState("");
  const [externalId, setExternalId] = useState<string | null>(null);
  const [convexId, setConvexId] = useState<Id<"lessons"> | null>(null);
  const [started, setStarted] = useState(false);
  const [uploadState, setUploadState] = useState<
    "idle" | "uploading" | "transcribing" | "done"
  >("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleBeginRecording = async () => {
    if (!title.trim() || !currentUser) return;

    const extId = `lesson-${Date.now()}`;
    const id = await createLesson({
      externalId: extId,
      teacherId: currentUser.externalId,
      studentId,
      title: title.trim(),
      order: existingLessonsCount + 1,
    });

    setExternalId(extId);
    setConvexId(id);
    setStarted(true);
  };

  const handleRecordingComplete = () => {
    if (externalId) {
      router.push(`/teacher/lessons/${externalId}`);
    }
  };

  const handleUploadClick = () => {
    if (!title.trim()) {
      toast.error(t("lessonTitle"));
      return;
    }
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;

    const extId = `lesson-${Date.now()}`;

    try {
      // Create the lesson
      setUploadState("uploading");
      const lessonId = await createLesson({
        externalId: extId,
        teacherId: currentUser.externalId,
        studentId,
        title: title.trim(),
        order: existingLessonsCount + 1,
      });

      // Get Soniox API key
      const apiKey = await getSonioxKey();

      // Upload file directly from browser to Soniox (no Convex memory limit)
      const formData = new FormData();
      formData.append("file", file, file.name);

      const uploadRes = await fetch("https://api.soniox.com/v1/files", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: formData,
      });

      if (!uploadRes.ok) {
        const err = await uploadRes.text();
        throw new Error(`Upload failed: ${err}`);
      }

      const { id: fileId } = await uploadRes.json();

      // Create async transcription
      setUploadState("transcribing");
      const transcribeRes = await fetch("https://api.soniox.com/v1/transcriptions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "stt-async-v4",
          file_id: fileId,
          language_hints: ["ar", "ru"],
          enable_speaker_diarization: true,
        }),
      });

      if (!transcribeRes.ok) {
        const err = await transcribeRes.text();
        throw new Error(`Transcription creation failed: ${err}`);
      }

      const { id: transcriptionId } = await transcribeRes.json();

      // Poll until complete (max ~5 minutes)
      let transcript = "";
      let durationSeconds = 0;
      const maxAttempts = 60;

      for (let i = 0; i < maxAttempts; i++) {
        await new Promise((resolve) => setTimeout(resolve, 5000));

        const statusRes = await fetch(
          `https://api.soniox.com/v1/transcriptions/${transcriptionId}`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );

        if (!statusRes.ok) continue;
        const statusData = await statusRes.json();

        if (statusData.status === "completed") {
          const transcriptRes = await fetch(
            `https://api.soniox.com/v1/transcriptions/${transcriptionId}/transcript`,
            { headers: { Authorization: `Bearer ${apiKey}` } }
          );

          if (!transcriptRes.ok) throw new Error("Failed to fetch transcript.");
          const transcriptData = await transcriptRes.json();

          const tokens = (transcriptData.tokens ?? []).map((t: any) => ({
            text: t.text ?? "",
            isFinal: true,
            startMs: t.start_ms ?? 0,
            endMs: t.end_ms ?? 0,
            speaker: t.speaker ?? undefined,
          }));
          transcript = tokens.map((t: any) => t.text).join("").trim();

          // Cleanup Soniox resources
          fetch(`https://api.soniox.com/v1/files/${fileId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${apiKey}` },
          }).catch(() => {});
          fetch(`https://api.soniox.com/v1/transcriptions/${transcriptionId}`, {
            method: "DELETE",
            headers: { Authorization: `Bearer ${apiKey}` },
          }).catch(() => {});
          break;
        }

        if (statusData.status === "error") {
          throw new Error(
            `Transcription failed: ${statusData.error_message ?? "Unknown error"}`
          );
        }

        if (i === maxAttempts - 1) {
          throw new Error("Transcription timed out after 5 minutes.");
        }
      }

      // Save transcript to lesson
      await finalizeTranscript({
        id: lessonId,
        transcript,
        durationSeconds,
      });

      setUploadState("done");
      toast.success(t("transcriptionDone"));

      // Navigate to lesson review
      router.push(`/teacher/lessons/${extId}`);
    } catch (err) {
      setUploadState("idle");
      toast.error(
        t("transcriptionFailed", {
          error: err instanceof Error ? err.message : "Unknown error",
        })
      );
    }

    e.target.value = "";
  };

  if (!student) {
    return (
      <div className="flex flex-col items-center py-20">
        <p className="text-muted-foreground">{t("studentNotFound")}</p>
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*,.mp3,.wav,.webm,.m4a,.ogg"
        className="hidden"
        onChange={handleFileSelected}
      />

      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() =>
            router.push(`/teacher/students/${studentId}`)
          }
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("recordingFor", { name: student.name })}
          </p>
        </div>
      </div>

      {!started && uploadState === "idle" ? (
        <div className="space-y-4 rounded-xl border bg-card p-6">
          <div>
            <label className="mb-2 block text-sm font-medium">
              {t("lessonTitle")}
            </label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("titlePlaceholder")}
              className="text-lg"
            />
          </div>

          {/* Two options: Record live or Upload */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Button
              onClick={handleBeginRecording}
              disabled={!title.trim()}
              className="w-full gap-2"
              size="lg"
            >
              <Mic className="h-5 w-5" />
              {t("beginRecording")}
            </Button>

            <Button
              onClick={handleUploadClick}
              disabled={!title.trim()}
              variant="outline"
              className="w-full gap-2"
              size="lg"
            >
              <Upload className="h-5 w-5" />
              {t("uploadRecording")}
            </Button>
          </div>

          <p className="text-center text-xs text-muted-foreground">
            {t("uploadDesc")}
          </p>
        </div>
      ) : uploadState !== "idle" ? (
        /* Upload progress */
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            {uploadState === "done" ? (
              <FileAudio className="h-12 w-12 text-primary" />
            ) : (
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            )}
            <div className="text-center">
              <p className="text-lg font-semibold">
                {uploadState === "uploading" && t("uploading")}
                {uploadState === "transcribing" && t("transcribing")}
                {uploadState === "done" && t("transcriptionDone")}
              </p>
              {uploadState === "transcribing" && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {t("supportedFormats")}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : convexId ? (
        <RecordingPanel
          lessonId={convexId}
          onRecordingComplete={handleRecordingComplete}
        />
      ) : null}
    </div>
  );
}

export default function NewLessonPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20">Loading...</div>}>
      <NewLessonContent />
    </Suspense>
  );
}
