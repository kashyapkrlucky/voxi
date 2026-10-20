"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Voice I/O, OpenAI only: the mic is recorded and sent to /api/transcribe; replies are spoken via /api/speech.

export type VoiceState = "idle" | "listening" | "transcribing" | "speaking";

const MIN_RECORDING_MS = 300;
// Smallest valid WAV (no samples). Played once during a tap to unlock audio on iOS.
const SILENT_WAV = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=";

// Live microphone loudness (0–1) for the orb. Writes into a callback every animation frame.
function createMeter(stream: MediaStream, onLevel: (v: number) => void): () => void {
  const ctx = new AudioContext();
  // Created after an await, so it may start suspended; the press that started listening allows resuming.
  void ctx.resume();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  ctx.createMediaStreamSource(stream).connect(analyser);
  const data = new Uint8Array(analyser.fftSize);
  let smoothed = 0;
  let raf = 0;
  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const sample of data) {
      const v = (sample - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    smoothed = smoothed * 0.7 + Math.min(1, rms * 5) * 0.3;
    onLevel(smoothed);
    raf = requestAnimationFrame(tick);
  };
  tick();
  return () => {
    cancelAnimationFrame(raf);
    void ctx.close();
    onLevel(0);
  };
}

// Plays `url` on a (reused) element and calls `onEnd` once when it finishes.
function playOn(el: HTMLAudioElement, url: string, onEnd: () => void): Promise<void> {
  el.addEventListener("ended", onEnd, { once: true });
  el.src = url;
  return el.play();
}

// Starts a muted, silent clip so iOS treats this element as user-activated for later playback.
function unlockElement(): HTMLAudioElement {
  const el = new Audio();
  el.setAttribute("playsinline", "");
  el.muted = true;
  el.src = SILENT_WAV;
  el.play()
    .catch(() => {})
    .finally(() => {
      el.pause();
      el.muted = false;
    });
  return el;
}

function errorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError") return "Microphone access is blocked. Allow it in your browser's site settings.";
  if (name === "NotFoundError") return "No microphone found.";
  return err instanceof Error ? err.message : "Voice input failed.";
}

export function useVoice({ onTranscript }: { onTranscript: (text: string) => void }) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  // One reusable player: iOS only lets audio play later if this element was started during a tap.
  const player = useRef<HTMLAudioElement | null>(null);
  const playerUrl = useRef<string | null>(null);
  const speechAbort = useRef<AbortController | null>(null);
  const startedAt = useRef(0);
  // Mic loudness for visuals; read it in an animation loop, not during render.
  const level = useRef(0);
  const stopMeter = useRef<(() => void) | null>(null);
  const cancelled = useRef(false);
  const onTranscriptRef = useRef(onTranscript);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  // Must run synchronously inside the tap/keypress that starts listening.
  const unlockAudio = useCallback(() => {
    if (!player.current) player.current = unlockElement();
  }, []);

  const meter = useCallback((stream: MediaStream) => {
    stopMeter.current?.();
    const stop = createMeter(stream, (v) => {
      level.current = v;
    });
    stopMeter.current = () => {
      stop();
      stopMeter.current = null;
    };
  }, []);

  const deliver = useCallback((text: string) => {
    stopMeter.current?.();
    setState("idle");
    if (!cancelled.current && text.trim()) onTranscriptRef.current(text.trim());
  }, []);

  const stopSpeaking = useCallback(() => {
    speechAbort.current?.abort();
    speechAbort.current = null;
    if (player.current && !player.current.paused) player.current.pause();
    if (playerUrl.current) {
      URL.revokeObjectURL(playerUrl.current);
      playerUrl.current = null;
    }
    setState((s) => (s === "speaking" ? "idle" : s));
  }, []);

  const start = useCallback(async () => {
    if (recorder.current) return;
    unlockAudio();
    stopSpeaking(); // barge-in: talking over Voxi stops it
    setError(null);
    cancelled.current = false;
    startedAt.current = Date.now();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        stopMeter.current?.();
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
      meter(stream);
    } catch (err) {
      setError(errorMessage(err));
      setState("idle");
    }
  }, [unlockAudio, stopSpeaking, deliver, meter]);

  // Finish listening and send what was heard.
  const stop = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  // Finish listening and throw it away.
  const cancel = useCallback(() => {
    cancelled.current = true;
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  const speak = useCallback(
    async (text: string) => {
      stopSpeaking();
      if (!text.trim()) return;

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
        if (abort.signal.aborted) return URL.revokeObjectURL(url);

        if (!player.current) player.current = new Audio();
        playerUrl.current = url;
        await playOn(player.current, url, () => {
          if (playerUrl.current === url) {
            URL.revokeObjectURL(url);
            playerUrl.current = null;
          }
          setState((s) => (s === "speaking" ? "idle" : s));
        });
      } catch (err) {
        if ((err as Error).name !== "AbortError") setError("Couldn't play the reply.");
        setState((s) => (s === "speaking" ? "idle" : s));
      }
    },
    [stopSpeaking],
  );

  // Release the mic and audio if the component goes away mid-use.
  useEffect(
    () => () => {
      cancelled.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stopMeter.current?.();
      speechAbort.current?.abort();
      player.current?.pause();
      if (playerUrl.current) URL.revokeObjectURL(playerUrl.current);
    },
    [],
  );

  return { state, error, level, start, stop, cancel, speak, stopSpeaking };
}
