import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pdfkit charge ses polices standard via `fs` : ne pas l'embarquer dans le bundle.
  serverExternalPackages: ["pdfkit"],
  // Playwright/CI utilisent 127.0.0.1 : autoriser les ressources dev (HMR/hydratation).
  allowedDevOrigins: ["127.0.0.1"],
};

export default nextConfig;
