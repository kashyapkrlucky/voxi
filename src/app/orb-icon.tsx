import { ImageResponse } from "next/og";

// The static Liquid orb (same look as OrbMark) drawn for icons. `scale` is the orb's share of the canvas;
// `background` fills the square (iOS and Android need an opaque icon), or leave it transparent for favicons.
// Opaque halo behind the orb: the blue is pre-blended into the background colour, so the icon stays opaque
// (iOS requires that) and fades smoothly into the background.
function glow(background: string, r: number) {
  const bg = [0, 2, 4].map((i) => parseInt(background.slice(1 + i, 3 + i), 16));
  const blue = [91, 140, 255];
  const mix = (a: number) => `rgb(${bg.map((c, i) => Math.round(c + (blue[i] - c) * a)).join(",")})`;
  return `radial-gradient(circle at 50% 50%, ${mix(0.55)} 0px, ${mix(0.3)} ${r * 1.05}px, ${mix(0.1)} ${r * 1.6}px, ${background} ${r * 2.4}px)`;
}

export function orbIcon({ size, scale, background }: { size: number; scale: number; background?: string }) {
  const orb = Math.round(size * scale);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: background ? glow(background, orb / 2) : "transparent",
      }}
    >
      <div
        style={{
          position: "relative",
          display: "flex",
          width: orb,
          height: orb,
          borderRadius: "50%",
          background: "linear-gradient(140deg, #6ee7f9, #5b8cff 48%, #a78bfa)",
        }}
      >
        {/* Shade toward the bottom right for depth */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "50%",
            background: "radial-gradient(circle at 72% 82%, rgba(20,20,60,0.22), rgba(0,0,0,0) 55%)",
          }}
        />
        {/* Glossy highlight, top left */}
        <div
          style={{
            position: "absolute",
            left: orb * 0.14,
            top: orb * 0.12,
            width: orb * 0.5,
            height: orb * 0.5,
            borderRadius: "50%",
            background: "linear-gradient(160deg, rgba(255,255,255,0.65), rgba(255,255,255,0) 70%)",
          }}
        />
      </div>
    </div>,
    { width: size, height: size },
  );
}
