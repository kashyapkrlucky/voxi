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

export async function synthesizeSpeech(text: string): Promise<{ audio: Uint8Array; mediaType: string }> {
  const result = await generateSpeech({
    model: openai.speech(process.env.OPENAI_TTS_MODEL ?? "gpt-4o-mini-tts"),
    text,
    voice: process.env.OPENAI_TTS_VOICE ?? "alloy",
    outputFormat: "mp3",
    instructions: "Friendly, calm personal assistant. Speak clearly and a little briskly.",
  });
  return { audio: result.audio.uint8Array, mediaType: result.audio.mediaType ?? "audio/mpeg" };
}
