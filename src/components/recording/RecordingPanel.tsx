"use client";

// Live lesson recorder.
//
// A session is continuous: the transcript and the session clock belong to the
// lesson, not to this browser tab. Everything transcribed here is snapshotted to
// the lesson while the lesson is still running (`lessons.saveSessionProgress`),
// so a reload, a crash, or an accidental tab close never loses it — the teacher
// comes back, presses Start Recording again, and carries on from the saved
// transcript. Time is the server's (lesson.sessionStartedAt); this panel only
// displays it, and nothing is ever dumped except by deleting the lesson.

import { useState, useEffect, useRef, useCallback, useImperativeHandle } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useAction } from "convex/react";
import { api } from "@convex";
import { SonioxRecorder, type AudioSource } from "@/lib/soniox/client";
import type { TranscriptToken } from "@/lib/transcript";
import { buildTranscript, buildSpeakerLabels } from "@/lib/transcript";
import { buildUtterances } from "@/lib/transcriptAnchors";
import { Button } from "@/components/ui/button";
import {
  Mic,
  Square,
  AlertCircle,
  Monitor,
  MonitorSpeaker,
  Pause,
  Play,
  Upload,
  Loader2,
} from "lucide-react";
import { WaveformVisualizer } from "./WaveformVisualizer";
import type { Id } from "@convex/dataModel";

const AUDIO_SOURCES: { value: AudioSource | "upload"; labelKey: string; icon: typeof Mic; descKey: string }[] = [
  { value: "mic", labelKey: "micOnly", icon: Mic, descKey: "micDesc" },
  { value: "both", labelKey: "micTab", icon: MonitorSpeaker, descKey: "micTabDesc" },
  { value: "tab", labelKey: "tabOnly", icon: Monitor, descKey: "tabDesc" },
  { value: "upload", labelKey: "upload", icon: Upload, descKey: "uploadDesc" },
];

/** How often a running session writes its transcript to the lesson. */
const PROGRESS_SAVE_MS = 20_000;

export interface RecordingPanelHandle { stopAndSave: () => Promise<void> }

interface RecordingPanelProps {
  ref?: React.Ref<RecordingPanelHandle>;
  lessonId: Id<"lessons">;
  onStop: () => void;
  onUploaded?: (storageId: Id<"_storage">, durationSec: number) => void;
  /** Teaching time for this session, owned by the server. */
  sessionSeconds?: number;
  /** Transcript already saved for this lesson (a resumed session continues it). */
  savedTranscript?: string;
  /** Seconds of audio already captured for this lesson before this load. */
  savedRecordedSeconds?: number;
  /** Called with the total captured-audio seconds so the page can end cleanly. */
  onRecordedSeconds?: (seconds: number) => void;
  /** Called with the session's durable start once recording begins. */
  onSessionStarted?: (sessionStartedAt: string | null) => void;
}

export function RecordingPanel({
  lessonId,
  onStop,
  onUploaded,
  sessionSeconds = 0,
  savedTranscript = "",
  savedRecordedSeconds = 0,
  onRecordedSeconds,
  onSessionStarted,
  ref,
}: RecordingPanelProps) {
  const t = useTranslations("recording");
  const [status, setStatus] = useState<
    "idle" | "connecting" | "connected" | "disconnected" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [liveTokens, setLiveTokens] = useState<TranscriptToken[]>([]);
  const [audioSource, setAudioSource] = useState<AudioSource | "upload">("both");
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);
  // Captured-audio readout (its own counter, not a session clock).
  const [recordedSeconds, setRecordedSeconds] = useState(savedRecordedSeconds);

  const clientRef = useRef<SonioxRecorder | null>(null);
  const tokensBufferRef = useRef<TranscriptToken[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const backupInFlightRef = useRef<Promise<void> | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioFlushTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const captureTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const capturedRef = useRef(0);
  const lastSnapshotRef = useRef("");
  const statusRef = useRef(status);
  statusRef.current = status;

  // The transcript already saved belongs to this session and is never
  // re-recorded. Utterance ids are namespaced per recording segment so a
  // resumed segment cannot overwrite the evidence from the earlier one.
  const prefixRef = useRef(savedTranscript.trim());
  const batchIdRef = useRef(savedTranscript.trim() ? `s${savedTranscript.length}_` : "");
  const sessionSecondsRef = useRef(sessionSeconds);
  sessionSecondsRef.current = sessionSeconds;
  const recordedTotal = useCallback(
    () => Math.max(0, Math.round(savedRecordedSeconds + capturedRef.current)),
    [savedRecordedSeconds]
  );

  const finalizeTranscript = useMutation(api.lessons.finalizeTranscript);
  const saveSessionProgress = useMutation(api.lessons.saveSessionProgress);
  const beginLiveSession = useMutation(api.lessons.beginLiveSession);
  const getSonioxKey = useAction(api.soniox.getApiKey);
  const generateUploadUrl = useMutation(api.lessonAudio.generateUploadUrl);
  const setAudioFile = useMutation(api.lessonAudio.setAudioFile);

  /** Saved transcript + everything transcribed in this recording segment. */
  const buildFullTranscript = useCallback((tokens: TranscriptToken[]) => {
    const segment = buildTranscript(tokens);
    const prefix = prefixRef.current;
    if (!prefix) return segment;
    if (!segment) return prefix;
    return `${prefix}\n\n${segment}`;
  }, []);

  const buildSegmentUtterances = useCallback((tokens: TranscriptToken[]) => {
    if (tokens.length === 0) return undefined;
    return buildUtterances(tokens).map(({ id, ...utterance }) => ({
      ...utterance,
      utteranceId: `${batchIdRef.current}${id}`,
    }));
  }, []);

  // Upload the accumulated audio chunks to Convex storage.
  // `final=true` means this is the closing flush from handleStop — we
  // also link the resulting storageId onto lessons.audioFileId.
  const flushAudio = useCallback(
    async (final: boolean) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) return;
      if (final && recorder.state !== "inactive") {
        await new Promise<void>((resolve) => {
          recorder.addEventListener("stop", () => resolve(), { once: true });
          recorder.stop();
        });
      } else if (recorder.state === "recording") {
        // ask for the current bucket
        recorder.requestData();
        await new Promise((r) => setTimeout(r, 50));
      }
      const chunks = [...audioChunksRef.current];
      if (chunks.length === 0) return;
      const mime = recorder.mimeType || "audio/webm";
      const blob = new Blob(chunks, { type: mime });
      try {
        const url = await generateUploadUrl({ lessonId });
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": mime },
          body: blob,
        });
        if (!res.ok) throw new Error(`Upload failed (${res.status})`);
        const { storageId } = (await res.json()) as { storageId: string };
        await setAudioFile({ lessonId, storageId: storageId as Id<"_storage"> });
      } catch (err) {
        console.error("[audio backup] upload failed", err);
        if (final) throw new Error("Audio could not be saved. Please retry End Session.");
      }
    },
    [generateUploadUrl, setAudioFile, lessonId]
  );

  /**
   * Write the running transcript, session time and captured-audio length to the
   * lesson. Best-effort by design: it runs on a timer, when the tab goes to the
   * background, and once more as the page unmounts, so closing or reloading the
   * live room cannot take the transcript with it.
   */
  const saveProgress = useCallback(async () => {
    if (statusRef.current !== "connected" && statusRef.current !== "disconnected") return;
    const tokens = tokensBufferRef.current;
    const transcript = buildFullTranscript(tokens);
    if (!transcript.trim()) return;
    const key = `${transcript.length}:${tokens.length}`;
    if (key === lastSnapshotRef.current) return;
    try {
      await saveSessionProgress({
        id: lessonId,
        transcript,
        recordedSeconds: recordedTotal(),
        utteranceBatchId: batchIdRef.current,
        utterances: buildSegmentUtterances(tokens),
      });
      lastSnapshotRef.current = key;
    } catch (err) {
      // A lost snapshot is retried on the next tick; the audio backup is the
      // second copy, and End Session finalizes the whole transcript anyway.
      console.warn("[session] progress save failed", err);
    }
  }, [buildFullTranscript, buildSegmentUtterances, lessonId, recordedTotal, saveSessionProgress]);
  const saveProgressRef = useRef(saveProgress);
  saveProgressRef.current = saveProgress;

  // Publish a transcript snapshot to window so the parent live page
  // can trigger async quiz generation without coupling to internal
  // token state. This is a one-way write — never read here.
  useEffect(() => {
    const snap = buildFullTranscript(liveTokens);
    if (
      typeof window !== "undefined" &&
      typeof (window as any).__omnic_setTranscriptSnapshot === "function"
    ) {
      (window as any).__omnic_setTranscriptSnapshot(snap);
    }
  }, [liveTokens, buildFullTranscript]);

  // Beforeunload protection
  useEffect(() => {
    if (status !== "connected") return;

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [status]);

  const handleStart = async () => {
    setError(null);
    if (mediaRecorderRef.current) {
      await backupInFlightRef.current;
      try { await flushAudio(true); } catch (err) { setError((err as Error).message); return; }
      mediaRecorderRef.current = null;
      audioChunksRef.current = [];
    }
    if (audioFlushTimerRef.current) clearInterval(audioFlushTimerRef.current);
    clientRef.current?.cancel();
    const client = new SonioxRecorder({ getApiKey: getSonioxKey });
    clientRef.current = client;

    await client.start(
      (tokens) => {
        // I.4 — when paused, drop incoming tokens but keep the
        // WebSocket alive so the timer (and future audio backup)
        // keeps running.
        if (pausedRef.current) return;
        setLiveTokens((prev) => {
          const finalTokens = prev.filter((t) => t.isFinal);
          const newTokens = [...finalTokens, ...tokens];
          tokensBufferRef.current = newTokens;
          return newTokens;
        });
      },
      (err) => {
        setError(err);
      },
      (newStatus) => {
        setStatus(newStatus);
        if (newStatus === "error" || newStatus === "disconnected") {
          // Keep what was transcribed: the session is still live and the
          // teacher can start again without losing the earlier part.
          void saveProgress();
        }
      },
      audioSource as AudioSource
    );

    // Stamp the durable session start now that recording has actually begun
    // (never before the capture call — display capture must stay inside the
    // click gesture). A resumed session returns its original start untouched.
    void beginLiveSession({ id: lessonId })
      .then((res) => onSessionStarted?.(res.sessionStartedAt))
      .catch(() => {
        // Losing the stamp only costs the durable clock; snapshots still save.
      });

    // I.1 — audio backup. Tap the same MediaStream Soniox is using
    // and stream it to Convex storage every 2 minutes as Opus-in-webm.
    try {
      const stream = client.getCaptureStream();
      if (stream && typeof MediaRecorder !== "undefined") {
        const mime = MediaRecorder.isTypeSupported(
          "audio/webm;codecs=opus"
        )
          ? "audio/webm;codecs=opus"
          : "audio/webm";
        const recorder = new MediaRecorder(new MediaStream(stream.getAudioTracks()), {
          mimeType: mime,
          audioBitsPerSecond: 64_000,
        });
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };
        recorder.start(1000);
        mediaRecorderRef.current = recorder;
        audioFlushTimerRef.current = setInterval(() => {
          if (!backupInFlightRef.current) {
            backupInFlightRef.current = flushAudio(false).finally(() => { backupInFlightRef.current = null; });
          }
        }, 120_000);
      }
    } catch (err) {
      console.warn("[audio backup] MediaRecorder failed", err);
    }

    // Snapshot the running transcript on a timer, and count the seconds of
    // audio the backup is actually capturing.
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    progressTimerRef.current = setInterval(() => { void saveProgress(); }, PROGRESS_SAVE_MS);
    if (captureTickRef.current) clearInterval(captureTickRef.current);
    captureTickRef.current = setInterval(() => {
      if (mediaRecorderRef.current?.state === "recording") {
        capturedRef.current += 1;
        const total = recordedTotal();
        setRecordedSeconds(total);
        onRecordedSeconds?.(total);
      }
    }, 1000);
  };

  const handleStop = async () => {
    if (audioFlushTimerRef.current) {
      clearInterval(audioFlushTimerRef.current);
      audioFlushTimerRef.current = null;
    }
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    if (captureTickRef.current) {
      clearInterval(captureTickRef.current);
      captureTickRef.current = null;
    }

    // Final flush + link before tearing the stream down, so the
    // recorder still has access to the live MediaStream.
    await backupInFlightRef.current;
    await flushAudio(true);
    mediaRecorderRef.current = null;

    if (clientRef.current) {
      await clientRef.current.stop();
      clientRef.current = null;
    }

    // The final transcript covers the whole session: the part already saved
    // (before a reload, or a previous segment) plus everything since.
    const tokens = tokensBufferRef.current;
    const transcript = buildFullTranscript(tokens);

    if (tokens.length) await finalizeTranscript({
      id: lessonId,
      transcript,
      // The server owns the session length; this is only the fallback for a
      // recording that was never opened as a live session.
      durationSeconds: sessionSecondsRef.current,
      recordedSeconds: recordedTotal(),
      utteranceBatchId: batchIdRef.current,
      utterances: buildSegmentUtterances(tokens),
    });

    onStop();
  };

  useImperativeHandle(ref, () => ({ stopAndSave: handleStop }));

  // Leaving the live room keeps the session: snapshot on hide and on unmount
  // before anything is torn down. The lesson, not this tab, owns the transcript.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void saveProgressRef.current();
    };
    window.addEventListener("pagehide", onHide);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      document.removeEventListener("visibilitychange", onHide);
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      if (captureTickRef.current) clearInterval(captureTickRef.current);
      if (audioFlushTimerRef.current) clearInterval(audioFlushTimerRef.current);
      void saveProgressRef.current();
      if (mediaRecorderRef.current?.state === "recording") {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      if (clientRef.current) {
        clientRef.current.cancel();
      }
    };
    // An empty dependency list is deliberate: this must run exactly once on
    // unmount, never mid-session (that would tear down a live recording).
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const isIdle = status === "idle" || status === "disconnected" || status === "error";
  const resumed = prefixRef.current.length > 0;

  return (
    <div className="space-y-6" translate="no">
      {/* Audio Source Selector — only visible before recording starts */}
      {isIdle && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">{t("audioSource")}</h3>
          <div className="grid gap-2 grid-cols-2 sm:grid-cols-4">
            {AUDIO_SOURCES.map((src) => {
              const Icon = src.icon;
              const selected = audioSource === src.value;
              return (
                <button
                  key={src.value}
                  onClick={() => setAudioSource(src.value)}
                  className={`flex items-center gap-3 rounded-lg border-2 p-3 text-start transition-all ${
                    selected
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 shrink-0 ${selected ? "text-brand-purple" : "text-muted-foreground"}`}
                  />
                  <div>
                    <p className={`text-sm font-medium ${selected ? "text-brand-purple" : ""}`}>
                      {t(src.labelKey)}
                    </p>
                    <p className="text-xs text-muted-foreground">{t(src.descKey)}</p>
                  </div>
                </button>
              );
            })}
          </div>
          {audioSource !== "mic" && (
            <p className="mt-3 text-xs text-muted-foreground">
              {t("tabShareNote")}
            </p>
          )}
        </div>
      )}

      {/* Session clock & Controls */}
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="text-5xl font-bold tabular-nums tracking-wider text-foreground">
          {formatTime(sessionSeconds)}
        </div>

        {resumed && (
          <p className="max-w-xl text-center text-sm" style={{ color: "var(--omnic-gray-600)" }}>
            Continuing a saved session — {Math.max(1, Math.round(prefixRef.current.length / 1000))}k
            characters of transcript are already saved. Starting the recording again adds to them.
          </p>
        )}

        {/* Waveform */}
        {status === "connected" && clientRef.current && (
          <WaveformVisualizer
            analyserNode={clientRef.current.getAnalyserNode()}
          />
        )}

        <div className="flex gap-3">
          {isIdle ? (
            audioSource === "upload" ? (
              <UploadButton
                lessonId={lessonId}
                onUploaded={(storageId, durationSec) => onUploaded?.(storageId, durationSec)}
              />
            ) : (
              <Button
                size="lg"
                onClick={handleStart}
                className="gap-2 rounded-full px-8"
              >
                <Mic className="h-5 w-5" />
                <span>{resumed ? "Continue recording" : t("startRecording")}</span>
              </Button>
            )
          ) : status === "connecting" ? (
            <Button size="lg" disabled className="gap-2 rounded-full px-8">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              <span>{t("connecting")}</span>
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={() => {
                pausedRef.current = !pausedRef.current;
                setPaused(pausedRef.current);
              }}
              className="gap-2 rounded-full px-6"
              style={{
                background: paused ? "var(--primary)" : "#f59e0b",
                color: "white",
                border: "none",
              }}
            >
              {paused ? (
                <>
                  <Play className="h-4 w-4" /><span>Resume</span>
                </>
              ) : (
                <>
                  <Pause className="h-4 w-4" /><span>Pause</span>
                </>
              )}
            </Button>
          )}
        </div>

        {paused && status === "connected" && (
          <div
            className="rounded-lg px-4 py-2 text-sm"
            style={{
              background: "var(--brand-yellow-soft)",
              color: "var(--brand-purple-deep)",
              border: "1px solid var(--brand-yellow)",
            }}
          >
            ⏸ Transcription paused — lesson timer keeps running
          </div>
        )}

        {status === "connected" && (
          <p className="flex items-center gap-2 text-sm text-brand-purple">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            {audioSource === "both" && t("recordingBoth")}
            {audioSource === "tab" && t("recordingTab")}
            {audioSource === "mic" && t("recordingMic")}
            <span className="text-muted-foreground">
              · saved to the lesson every {Math.round(PROGRESS_SAVE_MS / 1000)}s · audio{" "}
              {formatTime(recordedSeconds)}
            </span>
          </p>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Live Transcript */}
      <div className="rounded-xl border bg-card p-4">
        <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {t("liveTranscript")}
        </h3>
        <div className="min-h-[120px] text-lg leading-relaxed" lang="en">
          {liveTokens.length === 0 && status !== "connected" && (
            <p className="text-muted-foreground/50 text-center">
              {resumed
                ? "The saved transcript is kept — start recording to continue it."
                : t("startToSee")}
            </p>
          )}
          {liveTokens.length === 0 && status === "connected" && (
            <p className="text-muted-foreground/50 text-center">
              {t("listening")}
            </p>
          )}
          {(() => {
            const speakerMap = buildSpeakerLabels(liveTokens);
            let lastShown = "";
            return liveTokens.map((token, i) => {
              let label = "";
              if (token.speaker) {
                label = speakerMap.get(token.speaker) ?? "";
              }
              const showLabel = label !== "" && label !== lastShown;
              if (showLabel) lastShown = label;
              return (
                <span key={`${i}-${token.startMs}`}>
                  {showLabel && (
                    <span className="mt-2 mb-1 block text-xs font-semibold text-brand-purple">
                      {label}:
                    </span>
                  )}
                  <span
                    className={
                      token.isFinal
                        ? "text-foreground"
                        : "text-foreground/40"
                    }
                  >
                    {token.text}
                  </span>
                </span>
              );
            });
          })()}
        </div>
      </div>
    </div>
  );
}

function UploadButton({
  lessonId,
  onUploaded,
}: {
  lessonId: Id<"lessons">;
  onUploaded: (storageId: Id<"_storage">, durationSec: number) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const generateUploadUrl = useMutation(api.lessonAudio.generateUploadUrl);
  const setAudioFile = useMutation(api.lessonAudio.setAudioFile);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      // Extract duration
      const durationSec = await getFileDuration(file);

      // Upload to Convex storage
      const url = await generateUploadUrl({ lessonId });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
      });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);
      const { storageId } = (await res.json()) as { storageId: string };
      await setAudioFile({
        lessonId,
        storageId: storageId as Id<"_storage">,
      });

      onUploaded(storageId as Id<"_storage">, durationSec);
    } catch (err) {
      console.error("[upload] failed", err);
    } finally {
      setUploading(false);
    }
  }

  return (
    <label
      className="inline-flex items-center gap-2 rounded-full px-8 py-2.5 text-sm font-medium cursor-pointer transition-colors"
      style={{
        background: "var(--primary)",
        color: "white",
        opacity: uploading ? 0.7 : 1,
      }}
    >
      {uploading ? (
        <>
          <Loader2 size={16} className="animate-spin" /> Uploading…
        </>
      ) : (
        <>
          <Upload size={16} /> Upload audio/video
        </>
      )}
      <input
        type="file"
        accept="audio/*,video/*"
        onChange={handleFile}
        disabled={uploading}
        className="hidden"
      />
    </label>
  );
}

function getFileDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const el = document.createElement(file.type.startsWith("video") ? "video" : "audio");
    el.preload = "metadata";
    el.onloadedmetadata = () => {
      window.URL.revokeObjectURL(el.src);
      resolve(Math.round(el.duration));
    };
    el.onerror = () => {
      window.URL.revokeObjectURL(el.src);
      reject(new Error("Could not read file duration"));
    };
    el.src = URL.createObjectURL(file);
  });
}
