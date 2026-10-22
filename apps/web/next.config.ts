import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@registro-obra/contrato"],
  // La API vive en otro contenedor; el navegador la ve en el mismo origen y así
  // las cookies de sesión (httpOnly) viajan solas.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.API_URL_INTERNA ?? "http://localhost:8080"}/api/:path*` }];
  },
};

export default nextConfig;
