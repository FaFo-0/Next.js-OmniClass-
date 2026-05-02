import { action } from "./_generated/server";
import { v } from "convex/values";
import { requireAuthAction } from "./lib/auth";

/**
 * Returns the Soniox API key from Convex environment variables.
 * Used by the real-time recorder on the client.
 */
export const getApiKey = action({
  handler: async (ctx) => {
    await requireAuthAction(ctx);
    const apiKey = process.env.SONIOX_API_KEY;
    if (!apiKey) {
      throw new Error(
        "SONIOX_API_KEY not configured. Set it via: npx convex env set SONIOX_API_KEY <key>"
      );
    }
    return apiKey;
  },
});

/**
 * Transcribe an uploaded audio file via Soniox async API.
 * Steps: upload file to Soniox → create transcription → poll until done → return transcript.
 */
export const transcribeAudioFile = action({
  args: {
    storageId: v.id("_storage"),
  },
  handler: async (ctx, { storageId }) => {
    await requireAuthAction(ctx);

    const apiKey = process.env.SONIOX_API_KEY;
    if (!apiKey) {
      throw new Error("SONIOX_API_KEY not configured.");
    }

    // 1. Get file URL from Convex storage (avoids loading into memory)
    const fileUrl = await ctx.storage.getUrl(storageId);
    if (!fileUrl) throw new Error("Audio file not found in storage.");

    // 2. Stream file to Soniox (fetch → pipe, no full buffering)
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) throw new Error("Failed to fetch audio from storage.");
    const fileBlob = await fileRes.blob();

    const formData = new FormData();
    formData.append("file", fileBlob, "recording.webm");

    const uploadRes = await fetch("https://api.soniox.com/v1/files", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: formData,
    });

    if (!uploadRes.ok) {
      const err = await uploadRes.text();
      throw new Error(`Soniox file upload failed: ${err}`);
    }

    const { id: fileId } = await uploadRes.json();

    // 3. Create async transcription
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
      throw new Error(`Soniox transcription creation failed: ${err}`);
    }

    const { id: transcriptionId } = await transcribeRes.json();

    // 4. Poll until complete (max ~5 minutes)
    const maxAttempts = 60;
    const pollInterval = 5000; // 5 seconds

    for (let i = 0; i < maxAttempts; i++) {
      await new Promise((resolve) => setTimeout(resolve, pollInterval));

      const statusRes = await fetch(
        `https://api.soniox.com/v1/transcriptions/${transcriptionId}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );

      if (!statusRes.ok) continue;

      const statusData = await statusRes.json();

      if (statusData.status === "completed") {
        // 5. Get the transcript
        const transcriptRes = await fetch(
          `https://api.soniox.com/v1/transcriptions/${transcriptionId}/transcript`,
          { headers: { Authorization: `Bearer ${apiKey}` } }
        );

        if (!transcriptRes.ok) {
          throw new Error("Failed to fetch transcript.");
        }

        const transcriptData = await transcriptRes.json();

        // Map tokens to our format
        const tokens = (transcriptData.tokens ?? []).map((t: any) => ({
          text: t.text ?? "",
          isFinal: true,
          startMs: t.start_ms ?? 0,
          endMs: t.end_ms ?? 0,
          speaker: t.speaker ?? undefined,
        }));

        // Build plain text transcript
        const transcript = tokens.map((t: any) => t.text).join("").trim();

        // Cleanup: delete file and transcription from Soniox
        fetch(`https://api.soniox.com/v1/files/${fileId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${apiKey}` },
        }).catch(() => {});
        fetch(`https://api.soniox.com/v1/transcriptions/${transcriptionId}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${apiKey}` },
        }).catch(() => {});

        return { transcript, tokens, durationSeconds: 0 };
      }

      if (statusData.status === "error") {
        throw new Error(
          `Transcription failed: ${statusData.error_message ?? "Unknown error"}`
        );
      }
    }

    throw new Error("Transcription timed out after 5 minutes.");
  },
});
