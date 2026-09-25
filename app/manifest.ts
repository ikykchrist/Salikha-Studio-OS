import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Salikha Studio OS",
    short_name: "Salikha OS",
    description: "Salikha Studio operations workspace.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f6f8",
    theme_color: "#d93645",
    orientation: "portrait-primary",
    icons: [
      { src: "/icon.svg?v=2", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
