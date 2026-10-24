import type { MetadataRoute } from "next";

// Para instalar la versión de campo en la pantalla de inicio del celular
// (iPhone: Safari > Compartir > Agregar a inicio). Abre directo en /campo.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "ReporTE",
    short_name: "ReporTE",
    description: "Fotos de obra y pedidos de materiales desde el celular",
    start_url: "/campo",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f2ee",
    theme_color: "#0f1f3c",
    lang: "es-PY",
    icons: [
      { src: "/marca/icono-192.png", sizes: "192x192", type: "image/png" },
      { src: "/marca/icono-512.png", sizes: "512x512", type: "image/png" },
      { src: "/marca/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
