import { orbIcon } from "@/app/orb-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iPhone Home Screen icon: iOS needs an opaque square and rounds the corners itself.
export default function AppleIcon() {
  return orbIcon({ size: 180, scale: 0.62, background: "#08080d" });
}
