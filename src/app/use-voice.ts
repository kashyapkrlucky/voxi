"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useVoiceSettings } from "@/app/voice-settings";

// Minimal Web Speech API types (not in TypeScript's DOM lib).
type RecognitionResultList = ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: { results: RecognitionResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

export type VoiceState = "idle" | "listening" | "transcribing" | "speaking";

const MIN_RECORDING_MS = 300;

function recognitionCtor(): RecognitionCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function errorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : typeof err === "string" ? err : "";
  if (name === "NotAllowedError" || name === "not-allowed" || name === "service-not-allowed") {
    return "Microphone access is blocked. Allow it in your browser's site settings.";
  }
  if (name === "NotFoundError" || name === "audio-capture") return "No microphone found.";
  if (name === "network") return "Speech recognition needs a network connection.";
  return err instanceof Error ? err.message : "Voice input failed.";
}

export function useVoice({ onTranscript }: { onTranscript: (text: string) => void }) {
  const settings = useVoiceSettings();
  const [state, setState] = useState<VoiceState>("idle");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognition = useRef<Recognition | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  const speechAbort = useRef<AbortController | null>(null);
  const startedAt = useRef(0);
  const cancelled = useRef(false);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  const deliver = useCallback((text: string) => {
    setInterim("");
    setState("idle");
    if (!cancelled.current && text.trim()) onTranscriptRef.current(text.trim());
  }, []);

  const stopSpeaking = useCallback(() => {
    speechAbort.current?.abort();
    speechAbort.current = null;
    if (audio.current) {
      audio.current.pause();
      audio.current.src = "";
      audio.current = null;
    }
    if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    setState((s) => (s === "speaking" ? "idle" : s));
  }, []);

  const start = useCallback(async () => {
    if (recognition.current || recorder.current) return;
    stopSpeaking(); // barge-in: talking over Voxi stops it
    setError(null);
    setInterim("");
    cancelled.current = false;
    startedAt.current = Date.now();

    const Ctor = settings.stt === "browser" ? recognitionCtor() : undefined;
    if (Ctor) {
      const rec = new Ctor();
      rec.lang = navigator.language || "en-US";
      rec.continuous = true;
      rec.interimResults = true;
      let text = "";
      rec.onresult = (e) => {
        text = Array.from(e.results, (r) => r[0].transcript).join("");
        setInterim(text);
      };
      rec.onerror = (e) => {
        if (e.error !== "aborted" && e.error !== "no-speech") setError(errorMessage(e.error));
      };
      rec.onend = () => {
        recognition.current = null;
        deliver(text);
      };
      recognition.current = rec;
      setState("listening");
      rec.start();
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        recorder.current = null;
        if (cancelled.current || Date.now() - startedAt.current < MIN_RECORDING_MS) return deliver("");

        setState("transcribing");
        try {
          const form = new FormData();
          form.append("audio", new Blob(chunks, { type: rec.mimeType }), "speech");
          const res = await fetch("/api/transcribe", { method: "POST", body: form });
          const body = await res.json();
          if (!res.ok) throw new Error(body.error ?? "Transcription failed");
          deliver(body.text);
        } catch (err) {
          setError(errorMessage(err));
          deliver("");
        }
      };
      recorder.current = rec;
      setState("listening");
      rec.start();
    } catch (err) {
      setError(errorMessage(err));
      setState("idle");
    }
  }, [settings.stt, stopSpeaking, deliver]);

  // Finish listening and send what was heard.
  const stop = useCallback(() => {
    recognition.current?.stop();
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  // Finish listening and throw it away.
  const cancel = useCallback(() => {
    cancelled.current = true;
    recognition.current?.abort();
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const speak = useCallback(
    async (text: string) => {
      stopSpeaking();
      if (!text.trim() || settings.tts === "off") return;

      if (settings.tts === "browser" && typeof speechSynthesis !== "undefined") {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = navigator.language || "en-US";
        u.onend = () => setState((s) => (s === "speaking" ? "idle" : s));
        u.onerror = u.onend;
        setState("speaking");
        speechSynthesis.speak(u);
        return;
      }

      const abort = new AbortController();
      speechAbort.current = abort;
      setState("speaking");
      try {
        const res = await fetch("/api/speech", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: text.slice(0, 1000) }),
          signal: abort.signal,
        });
        if (!res.ok) throw new Error("Speech failed");
        const url = URL.createObjectURL(await res.blob());
        const player = new Audio(url);
        audio.current = player;
        player.onended = () => {
          URL.revokeObjectURL(url);
          if (audio.current === player) audio.current = null;
          setState((s) => (s === "speaking" ? "idle" : s));
        };
        await player.play();
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError("Couldn't play the reply.");
        setState((s) => (s === "speaking" ? "idle" : s));
      }
    },
    [settings.tts, stopSpeaking],
  );

  // Release the mic and audio if the component goes away mid-use.
  useEffect(
    () => () => {
      cancelled.current = true;
      recognition.current?.abort();
      if (recorder.current?.state === "recording") recorder.current.stop();
      speechAbort.current?.abort();
      audio.current?.pause();
      if (typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
    },
    [],
  );

  return { state, interim, error, start, stop, cancel, speak, stopSpeaking, settings };
}
