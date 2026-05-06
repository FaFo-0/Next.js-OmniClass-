"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useMutation, useAction } from "convex/react";
import { api } from "@convex";
import { SonioxRecorder, type AudioSource } from "@/lib/soniox/client";
import type { TranscriptToken } from "@/lib/transcript";
import { buildTranscript } from "@/lib/transcript";
import { Button } from "@/components/ui/button";
import { Mic, Square, AlertCircle, Monitor, MonitorSpeaker } from "lucide-react";
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

  const clientRef = useRef<SonioxRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const tokensBufferRef = useRef<TranscriptToken[]>([]);

  // Phase D will rewire to api.lessons.finalizeTranscript once the new
  // org-scoped lessons module lands. For now, finalize is a no-op.
  const finalizeTranscript: (...args: any[]) => Promise<any> = async () => null;
  const getSonioxKey = useAction(api.soniox.getApiKey);

  // Timer
  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setElapsed((prev) => prev + 1);
    }, 1000);
  }, []);

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

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
  };

  const handleStop = async () => {
    stopTimer();

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
            <Button
              size="lg"
              variant="destructive"
              onClick={handleStop}
              className="gap-2 rounded-full px-8"
            >
              <Square className="h-4 w-4" />
              {t("stopRecording")}
            </Button>
          )}
        </div>

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
        <div
          className="min-h-[120px] text-lg leading-relaxed"
          dir="rtl"
          lang="ar"
        >
          {liveTokens.length === 0 && status !== "connected" && (
            <p className="text-muted-foreground/50 text-center" dir="ltr">
              {t("startToSee")}
            </p>
          )}
          {liveTokens.length === 0 && status === "connected" && (
            <p className="text-muted-foreground/50 text-center" dir="ltr">
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
                    <span className="mt-2 mb-1 block text-xs font-semibold text-primary" dir="ltr">
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
