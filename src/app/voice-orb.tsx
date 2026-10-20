"use client";

import { AudioLines, Loader2, Mic } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type RefObject } from "react";

export type OrbState = "idle" | "listening" | "transcribing" | "thinking" | "speaking";

// Each state has its own palette and tempo; the gradient body spins, the halo breathes with mic level.
const palettes: Record<OrbState, [string, string, string]> = {
  idle: ["#7c5cff", "#22b8e6", "#c084fc"],
  listening: ["#ff4d8d", "#ff8a3d", "#b05cff"],
  transcribing: ["#6366f1", "#22d3ee", "#a78bfa"],
  thinking: ["#6366f1", "#22d3ee", "#8b5cf6"],
  speaking: ["#22d3ee", "#7c5cff", "#34d399"],
};
const spin: Record<OrbState, string> = {
  idle: "9s",
  listening: "3.5s",
  transcribing: "1.4s",
  thinking: "1.2s",
  speaking: "4s",
};

const TAP_MS = 280;

export function VoiceOrb({
  state,
  level,
  size = "md",
  disabled = false,
  onStart,
  onStop,
  onCancel,
}: {
  state: OrbState;
  level: RefObject<number>;
  size?: "lg" | "md";
  disabled?: boolean;
  onStart: () => void;
  onStop: () => void;
  onCancel: () => void;
}) {
  const root = useRef<HTMLButtonElement>(null);
  const pressedAt = useRef(0);
  const toggled = useRef(false);
  const listening = state === "listening";

  // Feed mic loudness into a CSS variable every frame, without re-rendering.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      root.current?.style.setProperty("--level", (level.current ?? 0).toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [level]);

  const [c1, c2, c3] = palettes[state];
  const px = size === "lg" ? 148 : 60;
  const style = {
    width: px,
    height: px,
    "--c1": c1,
    "--c2": c2,
    "--c3": c3,
    "--spin": spin[state],
  } as CSSProperties;

  const label = listening
    ? "Listening — release or tap to send"
    : state === "speaking"
      ? "Talk over Voxi"
      : "Hold or tap to talk";
  const Icon = state === "thinking" || state === "transcribing" ? Loader2 : state === "speaking" ? AudioLines : Mic;

  return (
    <button
      ref={root}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={listening}
      disabled={disabled}
      style={style}
      // Hold to talk, or tap to start and tap again to send.
      onPointerDown={(e) => {
        e.preventDefault();
        if (listening && toggled.current) {
          toggled.current = false;
          onStop();
          return;
        }
        e.currentTarget.setPointerCapture(e.pointerId);
        pressedAt.current = Date.now();
        onStart();
      }}
      onPointerUp={() => {
        if (!pressedAt.current) return;
        const held = Date.now() - pressedAt.current;
        pressedAt.current = 0;
        if (held < TAP_MS) toggled.current = true;
        else onStop();
      }}
      onPointerCancel={() => {
        pressedAt.current = 0;
        toggled.current = false;
        onCancel();
      }}
      onContextMenu={(e) => e.preventDefault()}
      className="group relative shrink-0 touch-none select-none rounded-full outline-none transition-transform duration-300 focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:opacity-50 active:scale-[0.97]"
    >
      {/* Halo */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-[35%] rounded-full opacity-60 blur-2xl transition-opacity duration-500 group-hover:opacity-80"
        style={{
          background: "radial-gradient(closest-side, var(--c1), var(--c2) 55%, transparent)",
          transform: "scale(calc(0.85 + var(--level, 0) * 0.9))",
          transition: "transform 80ms linear",
        }}
      />
      {/* Ripples while listening */}
      {listening && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-[var(--c1)] [animation:orb-ripple_1.8s_ease-out_infinite]"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full border-2 border-[var(--c2)] [animation:orb-ripple_1.8s_ease-out_0.9s_infinite]"
          />
        </>
      )}
      {/* Body */}
      <span
        aria-hidden
        className={`absolute inset-0 overflow-hidden rounded-full shadow-[0_10px_40px_-8px_var(--c1)] ${
          state === "speaking"
            ? "[animation:orb-speak_1.6s_ease-in-out_infinite]"
            : state === "idle"
              ? "[animation:orb-breathe_5s_ease-in-out_infinite]"
              : ""
        }`}
        style={
          listening
            ? { transform: "scale(calc(1 + var(--level, 0) * 0.16))", transition: "transform 80ms linear" }
            : undefined
        }
      >
        <span
          className="absolute -inset-1/4 [animation:orb-spin_var(--spin)_linear_infinite]"
          style={{ background: "conic-gradient(from 0deg, var(--c1), var(--c2), var(--c3), var(--c1))" }}
        />
        <span
          className="absolute inset-0 rounded-full"
          style={{
            background:
              "radial-gradient(circle at 32% 26%, rgb(255 255 255 / 0.55), rgb(255 255 255 / 0.08) 38%, transparent 60%), radial-gradient(circle at 70% 85%, rgb(0 0 0 / 0.25), transparent 55%)",
          }}
        />
        <span className="absolute inset-0 rounded-full ring-1 ring-inset ring-white/25" />
      </span>
      {/* Icon */}
      <span className="relative flex h-full w-full items-center justify-center text-white drop-shadow-[0_1px_6px_rgb(0_0_0/0.35)]">
        <Icon
          className={`${size === "lg" ? "size-10" : "size-6"} ${Icon === Loader2 ? "animate-spin" : ""}`}
          strokeWidth={size === "lg" ? 1.75 : 2}
        />
      </span>
    </button>
  );
}

// Small static mark used as the logo and the assistant's avatar.
export function OrbMark({ className = "size-6" }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={`relative inline-block shrink-0 overflow-hidden rounded-full shadow-[0_2px_10px_-2px_#7c5cff] ${className}`}
      style={{ background: "conic-gradient(from 210deg, #7c5cff, #22b8e6, #c084fc, #7c5cff)" }}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{ background: "radial-gradient(circle at 32% 26%, rgb(255 255 255 / 0.6), transparent 55%)" }}
      />
    </span>
  );
}
