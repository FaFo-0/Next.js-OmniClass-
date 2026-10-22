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
    video: true, // Keep this track alive for the lifetime of tab capture.
  });

  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error(
      "No audio captured. Make sure to select a tab (not a window) and check 'Share tab audio'."
    );
  }

  return stream;
}

async function captureMicAudio(): Promise<MediaStream> {
  return await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });
}

/** Which captured input stopped feeding the recording. */
export type LostCapture = "mic" | "tab";

export class SonioxRecorder {
  private config: SonioxConfig;
  private client: InstanceType<
    typeof import("@soniox/speech-to-text-web").SonioxClient
  > | null = null;
  private _isRecording = false;
  private finishPending: (() => void) | null = null;
  private _onTokens: OnTokensCallback | null = null;

  // Audio resources
  private audioContext: AudioContext | null = null;
  private analyserNode: AnalyserNode | null = null;
  private analyserSourceNode: MediaStreamAudioSourceNode | null = null;
  private micStream: MediaStream | null = null;
  private tabStream: MediaStream | null = null;
  private mixedStream: MediaStream | null = null;
  private _audioSource: AudioSource = "mic";

  // Every mode feeds one Web Audio destination, and Soniox consumes that
  // destination stream. A dead microphone or a stopped screen share can then be
  // replaced on the same graph — the session, the transcript and the single
  // audio-backup file all continue instead of restarting.
  private destination: MediaStreamAudioDestinationNode | null = null;
  private micSourceNode: MediaStreamAudioSourceNode | null = null;
  private tabSourceNode: MediaStreamAudioSourceNode | null = null;
  private lost: Record<LostCapture, boolean> = { mic: false, tab: false };
  private _onCaptureLost: ((lost: LostCapture) => void) | null = null;

  constructor(config: Partial<SonioxConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async start(
    onTokens: OnTokensCallback,
    onError: OnErrorCallback,
    onStatus: OnStatusCallback,
    audioSource: AudioSource = "mic",
    onCaptureLost?: (lost: LostCapture) => void
  ) {
    if (this._isRecording) return;
    this._onTokens = onTokens;
    this._audioSource = audioSource;
    this._onCaptureLost = onCaptureLost ?? null;

    try {
      onStatus("connecting");

      // Display capture must begin in the click gesture, before network/SDK awaits.
      if (audioSource !== "mic") this.tabStream = await captureTabAudio();
      if (audioSource !== "tab") this.micStream = await captureMicAudio();

      this.audioContext = new AudioContext();
      this.destination = this.audioContext.createMediaStreamDestination();
      if (this.tabStream) this.attachTab(this.tabStream);
      if (this.micStream) this.attachMic(this.micStream);
      this.attachAnalyser();

      // The one stream Soniox ever sees: it survives a re-acquired input.
      const streamForSoniox = this.destination.stream;
      this.mixedStream = streamForSoniox;

      // Lazy-load the SDK
      if (!SonioxClientClass) {
        const mod = await import("@soniox/speech-to-text-web");
        SonioxClientClass = mod.SonioxClient;
      }

      // Get API key via Convex action
      const apiKey = await this.config.getApiKey();

      await this.audioContext.resume();

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
          this.finishPending?.();
          this.cleanup();
        },
        onFinished: () => {
          this._isRecording = false;
          onStatus("disconnected");
          this.finishPending?.();
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

  /**
   * Route a captured stream into the graph Soniox is consuming, and watch its
   * tracks: a stopped screen share or a dead microphone ends them, which is the
   * signal to tell the teacher before the lesson quietly loses half its audio.
   */
  private attachTab(stream: MediaStream): void {
    const context = this.audioContext;
    const destination = this.destination;
    if (!context || !destination) return;
    const node = context.createMediaStreamSource(stream);
    node.connect(destination);
    this.tabSourceNode = node;
    this.lost.tab = false;
    for (const track of stream.getTracks()) {
      track.addEventListener("ended", () => this.reportCaptureLost("tab"));
    }
  }

  private attachMic(stream: MediaStream): void {
    const context = this.audioContext;
    const destination = this.destination;
    if (!context || !destination) return;
    const node = context.createMediaStreamSource(stream);
    node.connect(destination);
    this.micSourceNode = node;
    this.lost.mic = false;
    for (const track of stream.getTracks()) {
      track.addEventListener("ended", () => this.reportCaptureLost("mic"));
    }
  }

  /** Waveform source: the microphone when there is one, otherwise the tab. */
  private attachAnalyser(): void {
    const context = this.audioContext;
    if (!context) return;
    if (this.analyserSourceNode) {
      try {
        this.analyserSourceNode.disconnect();
      } catch {
        /* already disconnected */
      }
      this.analyserSourceNode = null;
    }
    const source = this.micSourceNode ?? this.tabSourceNode;
    if (!source) return;
    if (!this.analyserNode) {
      this.analyserNode = context.createAnalyser();
      this.analyserNode.fftSize = 256;
    }
    source.connect(this.analyserNode);
    this.analyserSourceNode = source;
  }

  private reportCaptureLost(lost: LostCapture): void {
    if (this.lost[lost]) return;
    this.lost[lost] = true;
    this._onCaptureLost?.(lost);
  }

  /**
   * Re-acquire a stopped input and put it back into the running graph.
   *
   * Soniox keeps the same destination stream, so the transcription session, the
   * session clock and the audio backup all continue: nothing is restarted and no
   * second recording is created. Display capture is requested first because it
   * needs the click gesture most; the caller must invoke this from a real user
   * action (an onClick), with no awaits in between.
   */
  async reacquire(): Promise<{ mic: boolean; tab: boolean }> {
    const restored = { mic: false, tab: false };
    if (!this.audioContext || !this.destination) {
      throw new Error("Recording is not running — start the recording again.");
    }
    if (this._audioSource !== "mic" && this.lost.tab) {
      const stream = await captureTabAudio();
      this.tabStream?.getTracks().forEach((t) => t.stop());
      this.tabStream = stream;
      this.tabSourceNode?.disconnect();
      this.attachTab(stream);
      if (!this.micStream) this.attachAnalyser();
      restored.tab = true;
    }
    if (this._audioSource !== "tab" && this.lost.mic) {
      const stream = await captureMicAudio();
      this.micStream?.getTracks().forEach((t) => t.stop());
      this.micStream = stream;
      this.micSourceNode?.disconnect();
      this.attachMic(stream);
      this.attachAnalyser();
      restored.mic = true;
    }
    return restored;
  }

  /** Which of this session's captured inputs stopped feeding the recording. */
  getCaptureStatus(): Record<LostCapture, boolean> {
    return {
      mic: this._audioSource !== "tab" && this.lost.mic,
      tab: this._audioSource !== "mic" && this.lost.tab,
    };
  }

  async stop(): Promise<void> {
    const client = this.client;
    if (client && this._isRecording) {
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 8000);
        this.finishPending = () => { clearTimeout(timeout); resolve(); };
        try { client.stop(); } catch { this.finishPending(); }
      });
    }
    this.finishPending = null;
    this._isRecording = false;
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
    this._isRecording = false;
    for (const node of [this.micSourceNode, this.tabSourceNode, this.analyserSourceNode]) {
      if (!node) continue;
      try {
        node.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.micSourceNode = null;
    this.tabSourceNode = null;
    this.analyserSourceNode = null;
    this.lost = { mic: false, tab: false };
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
    this.destination = null;
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
   * a parallel MediaRecorder for audio backup (I.1). This is the graph's
   * destination stream in every mode, so it outlives a re-acquired microphone or
   * screen share and the backup stays one continuous file. It is cleaned up
   * alongside the recorder, so callers must release their MediaRecorder before
   * SonioxRecorder.stop() runs.
   */
  getCaptureStream(): MediaStream | null {
    return this.mixedStream ?? this.micStream ?? this.tabStream;
  }

  get isRecording(): boolean {
    return this._isRecording;
  }

  get audioSource(): AudioSource {
    return this._audioSource;
  }
}
