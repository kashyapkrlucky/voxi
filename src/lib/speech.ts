import { openai } from "@ai-sdk/openai";
import { generateSpeech, transcribe } from "ai";

// Speech adapters (plan.md §4). Browser speech runs client-side; these are the OpenAI upgrades.

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024; // ~10 min of compressed speech
export const MAX_SPEECH_CHARS = 1000;

export async function transcribeAudio(audio: Uint8Array): Promise<string> {
  const result = await transcribe({
    model: openai.transcription(process.env.OPENAI_TRANSCRIBE_MODEL ?? "gpt-4o-transcribe"),
    audio,
  });
  return result.text.trim();
}

// Voxi speaks with a female voice. OPENAI_TTS_VOICE may pick another of OpenAI's female voices.
const FEMALE_VOICES = ["nova", "shimmer", "coral"] as const;
const voice = (FEMALE_VOICES as readonly string[]).includes(process.env.OPENAI_TTS_VOICE ?? "")
  ? process.env.OPENAI_TTS_VOICE!
  : "nova";

export async function synthesizeSpeech(text: string): Promise<{ audio: Uint8Array; mediaType: string }> {
  const result = await generateSpeech({
    model: openai.speech(process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts"),
    text,
    voice,
    outputFormat: "mp3",
    instructions: "Warm, friendly female personal assistant. Natural and upbeat, clear, a little brisk.",
  });
  return { audio: result.audio.uint8Array, mediaType: result.audio.mediaType ?? "audio/mpeg" };
}
