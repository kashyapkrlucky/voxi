import { handle } from "@/lib/api";
import { getCurrentUser } from "@/lib/owner";
import { MAX_AUDIO_BYTES, transcribeAudio } from "@/lib/speech";

export const maxDuration = 30;

// multipart/form-data with an `audio` file (whatever MediaRecorder produced: webm, mp4, ogg).
export async function POST(req: Request) {
  // Costs OpenAI usage, so require a signed-in user even though proxy.ts already does.
  try {
    await getCurrentUser();
  } catch (err) {
    return handle(() => Promise.reject(err));
  }
  const form = await req.formData().catch(() => null);
  const file = form?.get("audio");
  if (!(file instanceof Blob) || file.size === 0) {
    return Response.json({ error: "Missing audio" }, { status: 400 });
  }
  if (file.size > MAX_AUDIO_BYTES) {
    return Response.json({ error: "Audio too long" }, { status: 413 });
  }

  try {
    const text = await transcribeAudio(new Uint8Array(await file.arrayBuffer()));
    return Response.json({ text });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Transcription failed" }, { status: 502 });
  }
}
