import { z } from "zod";
import { handle, readJson } from "@/lib/api";
import { getCurrentUser } from "@/lib/owner";
import { MAX_SPEECH_CHARS, synthesizeSpeech } from "@/lib/speech";

export const maxDuration = 30;

const body = z.object({ text: z.string().trim().min(1).max(MAX_SPEECH_CHARS) });

// Returns audio bytes for the client to play.
export async function POST(req: Request) {
  // Costs OpenAI usage, so require a signed-in user even though proxy.ts already does.
  try {
    await getCurrentUser();
  } catch (err) {
    return handle(() => Promise.reject(err));
  }
  const parsed = body.safeParse(await readJson(req));
  if (!parsed.success) return Response.json({ error: "Invalid input" }, { status: 400 });

  try {
    const { audio, mediaType } = await synthesizeSpeech(parsed.data.text);
    return new Response(new Blob([audio as Uint8Array<ArrayBuffer>], { type: mediaType }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    console.error(err);
    return Response.json({ error: "Speech failed" }, { status: 502 });
  }
}
