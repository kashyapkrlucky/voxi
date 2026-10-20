import { orbIcon } from "@/app/orb-icon";

export const size = { width: 512, height: 512 };
export const contentType = "image/png";

// Favicon and the manifest's general icon: the orb on transparent.
export default function Icon() {
  return orbIcon({ size: 512, scale: 0.9 });
}
