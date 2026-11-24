import type { MetadataRoute } from "next";

// Makes the app installable on a phone home screen (PWA).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "HostelPulse",
    short_name: "HostelPulse",
    description: "Find the profit hiding in your hostel.",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f3ef",
    theme_color: "#13232b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
