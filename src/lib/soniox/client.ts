"use client";

import type { TranscriptToken } from "@/lib/transcript";

export interface SonioxConfig {
  getApiKey: () => Promise<string>;
  model: string;
  languageHints: string[];
}

export type AudioSource = "mic" | "tab" | "both";

const DEFAULT_CONFIG: SonioxConfig = {
  getApiKey: async () => { throw new Error("getApiKey not configured"); },
  model: "stt-rt-v4",
  languageHints: ["ar", "ru"],
};

export type OnTokensCallback = (tokens: TranscriptToken[]) => void;
export type OnErrorCallback = (error: string) => void;
export type OnStatusCallback = (
  status: "connecting" | "connected" | "disconnected" | "error"
) => void;

let SonioxClientClass: typeof import("@soniox/speech-to-text-web").SonioxClient | null =
  null;

/**
 * Capture tab audio via getDisplayMedia.
 * Chrome will prompt the user to pick a tab — they should select their Google Meet tab.
 * Returns the display MediaStream (which includes tab audio).
 */
async function captureTabAudio(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    audio: true,
    video: true, // Chrome requires video for tab capture, we'll discard it
  });

  // Stop the video track — we only need audio
  stream.getVideoTracks().forEach((t) => t.stop());

  if (stream.getAudioTracks().length === 0) {
    throw new Error(
      "No audio captured. Make sure to select a tab (not a window) and check 'Share tab audio'."
    );
  }

  return stream;
}

/**
 * Mix two audio streams into one using Web Audio API.
 * Used to combine microphone (teacher) + tab audio (student via Google Meet).
 */
function mixAudioStreams(
  stream1: MediaStream,
  stream2: MediaStream
): { mixed: MediaStream; audioContext: AudioContext } {
  const audioContext = new AudioContext();
  const dest = audioContext.createMediaStreamDestination();

  const source1 = audioContext.createMediaStreamSource(stream1);
  const source2 = audioContext.createMediaStreamSource(stream2);

  source1.connect(dest);
  source2.connect(dest);

  return { mixed: dest.stream, audioContext };
}

export class SonioxRecorder {
  private config: SonioxConfig;
  private client: InstanceType<
    typeof import("@soniox/speech-to-text-web").SonioxClient
  > | null = null;
  private _isRecording = false;
  private _onTokens: OnTokensCallback | null = null;

  // Audio resources
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private micStream: MediaStream | null = null;
  private tabStream: MediaStream | null = null;
  private mixedStream: MediaStream | null = null;
  private _audioSource: AudioSource = "mic";

  constructor(config: Partial<SonioxConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async start(
    onTokens: OnTokensCallback,
    onError: OnErrorCallback,
    onStatus: OnStatusCallback,
    audioSource: AudioSource = "mic"
  ) {
    if (this._isRecording) return;
    this._onTokens = onTokens;
    this._audioSource = audioSource;

    try {
      onStatus("connecting");

      // Lazy-load the SDK
      if (!SonioxClientClass) {
        const mod = await import("@soniox/speech-to-text-web");
        SonioxClientClass = mod.SonioxClient;
      }

      // Get API key via Convex action
      const apiKey = await this.config.getApiKey();

      // Capture audio based on source selection
      let streamForSoniox: MediaStream;

      if (audioSource === "mic") {
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        streamForSoniox = this.micStream;
      } else if (audioSource === "tab") {
        this.tabStream = await captureTabAudio();
        streamForSoniox = this.tabStream;
      } else {
        // "both" — capture mic + tab and mix them
        this.micStream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        this.tabStream = await captureTabAudio();
        const { mixed, audioContext } = mixAudioStreams(
          this.micStream,
          this.tabStream
        );
        this.mixedStream = mixed;
        this.audioContext = audioContext;
        streamForSoniox = mixed;
      }

      // Set up analyser for waveform (use mic if available, otherwise the stream)
      if (!this.audioContext) {
        this.audioContext = new AudioContext();
      }
      const analyserSource = this.audioContext.createMediaStreamSource(
        this.micStream || streamForSoniox
      );
      this.analyserNode = this.audioContext.createAnalyser();
      this.analyserNode.fftSize = 256;
      analyserSource.connect(this.analyserNode);

      // Create Soniox client
      this.client = new SonioxClientClass({
        apiKey,
        onStarted: () => {
          this._isRecording = true;
          onStatus("connected");
        },
        onPartialResult: (result) => {
          if (result.tokens && this._onTokens) {
            const mapped: TranscriptToken[] = result.tokens.map((t) => ({
              text: t.text,
              isFinal: t.is_final,
              startMs: t.start_ms ?? 0,
              endMs: t.end_ms ?? 0,
              speaker: t.speaker,
            }));
            this._onTokens(mapped);
          }
        },
        onError: (_status, message) => {
          onError(message);
          onStatus("error");
        },
        onFinished: () => {
          this._isRecording = false;
          onStatus("disconnected");
        },
      });

      // Start with the chosen stream + speaker diarization
      await this.client.start({
        model: this.config.model,
        languageHints: this.config.languageHints,
        enableSpeakerDiarization: true,
        stream: streamForSoniox,
      });
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
      onStatus("error");
      this.cleanup();
    }
  }

  stop(): void {
    if (!this._isRecording || !this.client) return;
    this._isRecording = false;
    try {
      this.client.stop();
    } catch {
      // ignore
    }
    this.cleanup();
  }

  cancel(): void {
    if (this.client) {
      try {
        this.client.cancel();
      } catch {
        // ignore
      }
    }
    this._isRecording = false;
    this.cleanup();
  }

  private cleanup() {
    if (this.micStream) {
      this.micStream.getTracks().forEach((t) => t.stop());
      this.micStream = null;
    }
    if (this.tabStream) {
      this.tabStream.getTracks().forEach((t) => t.stop());
      this.tabStream = null;
    }
    if (this.mixedStream) {
      this.mixedStream.getTracks().forEach((t) => t.stop());
      this.mixedStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close().catch(() => {});
      this.audioContext = null;
    }
    this.analyserNode = null;
    this.client = null;
  }

  getAnalyserNode(): AnalyserNode | null {
    return this.analyserNode;
  }

  /**
   * Returns the MediaStream Soniox is consuming so callers can attach
   * a parallel MediaRecorder for audio backup (I.1). The stream is
   * cleaned up alongside the recorder, so callers must release their
   * MediaRecorder before SonioxRecorder.stop() runs.
   */
  getCaptureStream(): MediaStream | null {
    return this.mixedStream ?? this.tabStream ?? this.micStream;
  }

  get isRecording(): boolean {
    return this._isRecording;
  }

  get audioSource(): AudioSource {
    return this._audioSource;
  }
}
