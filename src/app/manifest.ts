import type { MetadataRoute } from "next";

/** Lets phones add Trios to the home screen as an app: iPhones and iPads only allow notifications for those. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Trios",
    short_name: "Trios",
    description: "Le jeu de chiffres où chaque ligne de trois fait 15. The number game where every line of three adds up to 15.",
    start_url: "/",
    display: "standalone",
    background_color: "#e9f0f7",
    theme_color: "#e9f0f7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
