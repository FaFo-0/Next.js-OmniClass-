const SONIOX_API_KEY = process.env.SONIOX_API_KEY
const SONIOX_BASE_URL = "https://api.soniox.com/v4"

export async function startTranscription() {
  const res = await fetch(`${SONIOX_BASE_URL}/speech/transcribe/stream`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SONIOX_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "en-v2",
      enable_diarization: true,
      enable_partials: true,
    }),
  })
  return res.json()
}

export async function sendAudioChunk(streamId: string, chunk: ArrayBuffer) {
  const res = await fetch(`${SONIOX_BASE_URL}/speech/transcribe/stream/${streamId}/audio`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SONIOX_API_KEY}`,
      "Content-Type": "application/octet-stream",
    },
    body: chunk,
  })
  return res.json()
}

export async function stopTranscription(streamId: string) {
  const res = await fetch(`${SONIOX_BASE_URL}/speech/transcribe/stream/${streamId}/stop`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${SONIOX_API_KEY}`,
    },
  })
  return res.json()
}
