"use client";

import { AudioLines, Loader2, Mic } from "lucide-react";
import { useEffect, useRef, type CSSProperties, type RefObject } from "react";

export type OrbState = "idle" | "listening" | "transcribing" | "thinking" | "speaking";

// "Liquid" orb: a morphing gradient blob. Each state has its own palette and tempo; colours cross-fade
// (the --c* properties are registered in globals.css) and the blob swells with mic level while listening.
const palettes: Record<OrbState, [string, string, string]> = {
  idle: ["#6ee7f9", "#5b8cff", "#a78bfa"],
  listening: ["#ffb36b", "#ff5c8a", "#c26bff"],
  transcribing: ["#5b8cff", "#6ee7f9", "#a78bfa"],
  thinking: ["#5b8cff", "#6ee7f9", "#7c9cff"],
  speaking: ["#5eead4", "#5b8cff", "#6ee7f9"],
};
// Morph period (shape change) and drift period (slow rotation) per state.
const tempo: Record<OrbState, { morph: number; drift: number }> = {
  idle: { morph: 8, drift: 18 },
  listening: { morph: 2.2, drift: 6 },
  transcribing: { morph: 1.6, drift: 3 },
  thinking: { morph: 1.4, drift: 2.5 },
  speaking: { morph: 3, drift: 8 },
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
  const { morph, drift } = tempo[state];
  const px = size === "lg" ? 156 : 60;
  const style = {
    width: px,
    height: px,
    "--c1": c1,
    "--c2": c2,
    "--c3": c3,
    "--morph": `${morph}s`,
    "--morph-slow": `${morph * 1.35}s`,
    "--morph-fast": `${morph * 0.7}s`,
    "--drift": `${drift}s`,
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
      className="liquid-orb group relative shrink-0 touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-4 focus-visible:ring-offset-canvas disabled:opacity-50 active:scale-[0.96]"
    >
      {/* Halo: swells with your voice */}
      <span
        aria-hidden
        className="pointer-events-none absolute -inset-[40%] rounded-full opacity-55 blur-2xl transition-opacity duration-500 group-hover:opacity-75"
        style={{
          background: "radial-gradient(closest-side, var(--c2), var(--c1) 50%, transparent)",
          transform: "scale(calc(0.8 + var(--level, 0) * 1))",
          transition: "transform 90ms linear",
        }}
      />
      {/* Body: swells with level while listening, pulses while speaking, breathes when idle */}
      <span
        aria-hidden
        className={`pointer-events-none absolute inset-0 ${
          state === "speaking"
            ? "[animation:orb-speak_1.6s_ease-in-out_infinite]"
            : state === "idle"
              ? "[animation:orb-breathe_6s_ease-in-out_infinite]"
              : ""
        }`}
        style={
          listening
            ? { transform: "scale(calc(1 + var(--level, 0) * 0.22))", transition: "transform 90ms linear" }
            : undefined
        }
      >
        {/* A second, blurred blob behind gives depth */}
        <span
          className="absolute -inset-[6%] opacity-60 blur-md [animation:liquid_var(--morph-slow)_ease-in-out_infinite_reverse]"
          style={{ background: "linear-gradient(200deg, var(--c3), var(--c1))" }}
        />
        {/* Main blob drifts (rotates) while its outline morphs, so the gradient keeps moving */}
        <span className="absolute inset-0 [animation:orb-spin_var(--drift)_linear_infinite]">
          <span
            className="absolute inset-0 shadow-[inset_0_-8px_24px_rgb(0_0_0/0.18),0_12px_40px_-12px_var(--c2)] [animation:liquid_var(--morph)_ease-in-out_infinite]"
            style={{ background: "linear-gradient(140deg, var(--c1), var(--c2) 48%, var(--c3))" }}
          />
          {/* Glossy highlight moving against the main morph */}
          <span
            className="absolute left-[12%] top-[10%] h-[55%] w-[55%] opacity-70 [animation:liquid_var(--morph-fast)_ease-in-out_infinite_reverse]"
            style={{ background: "linear-gradient(160deg, rgb(255 255 255 / 0.55), transparent 70%)" }}
          />
        </span>
      </span>
      {/* Icon */}
      <span className="relative flex h-full w-full items-center justify-center text-white drop-shadow-[0_1px_8px_rgb(0_0_0/0.3)]">
        <Icon
          className={`${size === "lg" ? "size-10" : "size-6"} ${Icon === Loader2 ? "animate-spin" : ""}`}
          strokeWidth={size === "lg" ? 1.75 : 2}
        />
      </span>
    </button>
  );
}

// Static Liquid mark used as the logo and the assistant's avatar. Only the voice orb animates.
export function OrbMark({ className = "size-6" }: { className?: string }) {
  return (
    <span aria-hidden className={`relative inline-block shrink-0 ${className}`}>
      <span
        className="absolute inset-0 rounded-full shadow-[0_3px_12px_-3px_#5b8cff]"
        style={{ background: "linear-gradient(140deg, #6ee7f9, #5b8cff 48%, #a78bfa)" }}
      />
      <span
        className="absolute left-[14%] top-[12%] h-1/2 w-1/2 rounded-full opacity-70"
        style={{ background: "linear-gradient(160deg, rgb(255 255 255 / 0.6), transparent 70%)" }}
      />
    </span>
  );
}
