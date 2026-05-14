"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useAction } from "convex/react";
import { api } from "@convex";
import { SonioxRecorder, type AudioSource } from "@/lib/soniox/client";
import type { TranscriptToken } from "@/lib/transcript";
import { buildTranscript } from "@/lib/transcript";
import { Button } from "@/components/ui/button";
import {
  Mic,
  Square,
  AlertCircle,
  Monitor,
  MonitorSpeaker,
  Pause,
  Play,
} from "lucide-react";
import { WaveformVisualizer } from "./WaveformVisualizer";
import type { Id } from "@convex/dataModel";

const AUDIO_SOURCES: { value: AudioSource; labelKey: string; icon: typeof Mic; descKey: string }[] = [
  { value: "mic", labelKey: "micOnly", icon: Mic, descKey: "micDesc" },
  { value: "both", labelKey: "micTab", icon: MonitorSpeaker, descKey: "micTabDesc" },
  { value: "tab", labelKey: "tabOnly", icon: Monitor, descKey: "tabDesc" },
];

interface RecordingPanelProps {
  lessonId: Id<"lessons">;
  onRecordingComplete: () => void;
}

export function RecordingPanel({
  lessonId,
  onRecordingComplete,
}: RecordingPanelProps) {
  const t = useTranslations("recording");
  const [status, setStatus] = useState<
    "idle" | "connecting" | "connected" | "disconnected" | "error"
  >("idle");
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [liveTokens, setLiveTokens] = useState<TranscriptToken[]>([]);
  const [audioSource, setAudioSource] = useState<AudioSource>("both");
  const [paused, setPaused] = useState(false);
  const pausedRef = useRef(false);

  const clientRef = useRef<SonioxRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokensBufferRef = useRef<TranscriptToken[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioFlushTimerRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  const finalizeTranscript = useMutation(api.lessons.finalizeTranscript);
  const getSonioxKey = useAction(api.soniox.getApiKey);
  const generateUploadUrl = useMutation(api.lessonAudio.generateUploadUrl);
  const setAudioFile = useMutation(api.lessonAudio.setAudioFile);

  // Upload the accumulated audio chunks to Convex storage.
  // `final=true` means this is the closing flush from handleStop — we
  // also link the resulting storageId onto lessons.audioFileId.
  const flushAudio = useCallback(
    async (final: boolean) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder) return;
      if (final && recorder.state !== "inactive") {
        try {
          recorder.stop();
        } catch {
          /* already stopped */
        }
        // wait for the final dataavailable to land
        await new Promise((r) => setTimeout(r, 100));
      } else if (recorder.state === "recording") {
        // ask for the current bucket
        recorder.requestData();
        await new Promise((r) => setTimeout(r, 50));
      }
      const chunks = audioChunksRef.current.splice(
        0,
        audioChunksRef.current.length
      );
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
        if (final) {
          await setAudioFile({
            lessonId,
            storageId: storageId as Id<"_storage">,
          });
        }
      } catch (err) {
        console.error("[audio backup] upload failed", err);
      }
    },
    [generateUploadUrl, setAudioFile, lessonId]
  );

  // Timer
  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  // Publish a transcript snapshot to window so the parent live page
  // can trigger async quiz generation without coupling to internal
  // token state. This is a one-way write — never read here.
  useEffect(() => {
    const snap = buildTranscript(liveTokens);
    if (
      typeof window !== "undefined" &&
      typeof (window as any).__omnic_setTranscriptSnapshot === "function"
    ) {
      (window as any).__omnic_setTranscriptSnapshot(snap);
    }
  }, [liveTokens]);

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
        if (newStatus === "connected") {
          startTimer();
        }
      },
      audioSource
    );

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
        const recorder = new MediaRecorder(stream, {
          mimeType: mime,
          audioBitsPerSecond: 64_000,
        });
        recorder.ondataavailable = (e) => {
          if (e.data && e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };
        recorder.start();
        mediaRecorderRef.current = recorder;
        audioFlushTimerRef.current = setInterval(() => {
          void flushAudio(false);
        }, 120_000);
      }
    } catch (err) {
      console.warn("[audio backup] MediaRecorder failed", err);
    }
  };

  const handleStop = async () => {
    stopTimer();
    if (audioFlushTimerRef.current) {
      clearInterval(audioFlushTimerRef.current);
      audioFlushTimerRef.current = null;
    }

    // Final flush + link before tearing the stream down, so the
    // recorder still has access to the live MediaStream.
    await flushAudio(true);
    mediaRecorderRef.current = null;

    if (clientRef.current) {
      clientRef.current.stop();
      clientRef.current = null;
    }

    // Build final transcript and save to Convex
    const tokens = tokensBufferRef.current;
    const transcript = buildTranscript(tokens);

    await finalizeTranscript({
      id: lessonId,
      transcript,
      durationSeconds: elapsed,
    });

    onRecordingComplete();
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      if (audioFlushTimerRef.current) {
        clearInterval(audioFlushTimerRef.current);
      }
      if (mediaRecorderRef.current?.state === "recording") {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          /* ignore */
        }
      }
      if (clientRef.current) {
        clientRef.current.stop();
      }
    };
  }, []);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const isIdle = status === "idle" || status === "disconnected" || status === "error";

  return (
    <div className="space-y-6">
      {/* Audio Source Selector — only visible before recording starts */}
      {isIdle && (
        <div className="rounded-xl border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">{t("audioSource")}</h3>
          <div className="grid gap-2 sm:grid-cols-3">
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
                    className={`h-5 w-5 shrink-0 ${selected ? "text-primary" : "text-muted-foreground"}`}
                  />
                  <div>
                    <p className={`text-sm font-medium ${selected ? "text-primary" : ""}`}>
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

      {/* Timer & Controls */}
      <div className="flex flex-col items-center gap-6 py-8">
        <div className="text-5xl font-bold tabular-nums tracking-wider text-foreground">
          {formatTime(elapsed)}
        </div>

        {/* Waveform */}
        {status === "connected" && clientRef.current && (
          <WaveformVisualizer
            analyserNode={clientRef.current.getAnalyserNode()}
          />
        )}

        <div className="flex gap-3">
          {isIdle ? (
            <Button
              size="lg"
              onClick={handleStart}
              className="gap-2 rounded-full px-8"
            >
              <Mic className="h-5 w-5" />
              {t("startRecording")}
            </Button>
          ) : status === "connecting" ? (
            <Button size="lg" disabled className="gap-2 rounded-full px-8">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
              {t("connecting")}
            </Button>
          ) : (
            <>
              <Button
                size="lg"
                variant="outline"
                onClick={() => {
                  pausedRef.current = !pausedRef.current;
                  setPaused(pausedRef.current);
                }}
                className="gap-2 rounded-full px-6"
              >
                {paused ? (
                  <>
                    <Play className="h-4 w-4" /> Resume
                  </>
                ) : (
                  <>
                    <Pause className="h-4 w-4" /> Pause
                  </>
                )}
              </Button>
              <Button
                size="lg"
                variant="destructive"
                onClick={handleStop}
                className="gap-2 rounded-full px-8"
              >
                <Square className="h-4 w-4" />
                {t("stopRecording")}
              </Button>
            </>
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
          <p className="flex items-center gap-2 text-sm text-primary">
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
            {audioSource === "both" && t("recordingBoth")}
            {audioSource === "tab" && t("recordingTab")}
            {audioSource === "mic" && t("recordingMic")}
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
              {t("startToSee")}
            </p>
          )}
          {liveTokens.length === 0 && status === "connected" && (
            <p className="text-muted-foreground/50 text-center">
              {t("listening")}
            </p>
          )}
          {(() => {
            let lastSpeaker = "";
            return liveTokens.map((token, i) => {
              const showLabel =
                token.speaker && token.speaker !== lastSpeaker;
              if (token.speaker) lastSpeaker = token.speaker;
              return (
                <span key={`${i}-${token.startMs}`}>
                  {showLabel && (
                    <span className="mt-2 mb-1 block text-xs font-semibold text-primary">
                      {token.speaker}
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
