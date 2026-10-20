import { orbIcon } from "@/app/orb-icon";

// Android adaptive icon: launchers crop to a circle/squircle, so keep the orb inside the central safe zone.
export function GET() {
  return orbIcon({ size: 512, scale: 0.5, background: "#08080d" });
}
