import type { MetadataRoute } from "next";

// Installable PWA; on iPhone, web push only works once added to the Home Screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Voxi",
    short_name: "Voxi",
    description: "Voice task assistant",
    start_url: "/",
    display: "standalone",
    background_color: "#08080d",
    theme_color: "#08080d",
    icons: [
      { src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png" },
    ],
  };
}
