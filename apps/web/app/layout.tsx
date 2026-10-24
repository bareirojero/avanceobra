import type { Metadata, Viewport } from "next";
import { Archivo, Inter } from "next/font/google";
import { Guardia } from "@/components/guardia";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap", variable: "--font-inter" });
const archivo = Archivo({ subsets: ["latin"], weight: ["600", "700", "800"], display: "swap", variable: "--font-archivo" });

export const metadata: Metadata = {
  title: "ReporTE",
  description: "Fotos y comentarios de campo, e informe diario de obra",
  icons: { apple: "/marca/apple-touch-icon.png" },
  // Agregada a la pantalla de inicio del iPhone se abre como app, sin barras de Safari.
  appleWebApp: { capable: true, title: "ReporTE", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0f1f3c",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-PY" className={`${inter.variable} ${archivo.variable}`}>
      <body className="min-h-screen">
        <Guardia>{children}</Guardia>
      </body>
    </html>
  );
}
