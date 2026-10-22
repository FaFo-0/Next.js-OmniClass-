"use client";

// The saved lesson recording, playable in the lesson's Transcript & Audio tab.
//
// Teacher and admin only: the URL comes from the role-gated
// `lessonAudio.getRecording` query, so a student reading their own published
// lesson never receives the audio.

import { useQuery } from "convex-helpers/react/cache/hooks";
import { api } from "@convex";
import type { Id } from "@convex/dataModel";
import { AudioLines, Download } from "lucide-react";

function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function LessonAudioPlayer({ lessonId }: { lessonId: Id<"lessons"> }) {
  const recording = useQuery(api.lessonAudio.getRecording, { lessonId });

  if (recording === undefined) {
    return <p className="text-sm text-muted-foreground">Loading recording…</p>;
  }
  if (recording === null) {
    return (
      <p className="text-sm text-muted-foreground">
        No audio saved for this lesson yet.
      </p>
    );
  }

  const saved = new Date(recording.savedAt);
  return (
    <div
      className="rounded-lg border bg-card p-5"
      style={{ borderColor: "var(--omnic-gray-100)" }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-semibold">
          <AudioLines size={16} style={{ color: "var(--brand-purple)" }} />
          Audio
        </h3>
        <a
          href={recording.url}
          download
          className="inline-flex items-center gap-1 text-sm underline"
          style={{ color: "var(--brand-purple)" }}
        >
          <Download size={13} /> Download
        </a>
      </div>
      <audio controls preload="metadata" src={recording.url} className="w-full" />
      <p className="mt-2 text-xs" style={{ color: "var(--omnic-gray-500)" }}>
        {recording.recordingMode === "upload" ? "Uploaded file" : "Live recording"}
        {recording.recordedSeconds !== null
          ? ` · ${clock(recording.recordedSeconds)} of audio captured`
          : ""}
        {` · lesson length ${clock(recording.durationSeconds)}`}
        {` · saved ${saved.toLocaleDateString()} ${saved.toLocaleTimeString()}`}
      </p>
    </div>
  );
}
