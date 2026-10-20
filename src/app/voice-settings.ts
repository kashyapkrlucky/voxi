"use client";

import { useSyncExternalStore } from "react";

// Per-device voice preferences, kept in localStorage (they only matter on this device).
export type SttEngine = "browser" | "openai";
export type TtsEngine = "browser" | "openai" | "off";
export type VoiceSettings = { stt: SttEngine; tts: TtsEngine };

const KEY = "voxi.voice";
const DEFAULTS: VoiceSettings = { stt: "browser", tts: "browser" };

let current: VoiceSettings | null = null;
const listeners = new Set<() => void>();

function load(): VoiceSettings {
  if (current) return current;
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    current = { ...DEFAULTS, ...saved };
  } catch {
    current = DEFAULTS;
  }
  // Browsers without the Web Speech API (e.g. Firefox) fall back to OpenAI transcription.
  if (current!.stt === "browser" && !browserSttSupported()) current = { ...current!, stt: "openai" };
  return current!;
}

export function setVoiceSettings(patch: Partial<VoiceSettings>) {
  current = { ...load(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(current));
  } catch {
    // Private mode etc.: keep the in-memory value.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useVoiceSettings(): VoiceSettings {
  return useSyncExternalStore(subscribe, load, () => DEFAULTS);
}

export function browserSttSupported(): boolean {
  return typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
}

const noop = () => () => {};

// True only after hydration, so browser-only UI doesn't mismatch the server render.
export function useIsClient(): boolean {
  return useSyncExternalStore(noop, () => true, () => false);
}
