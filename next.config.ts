import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pdfkit charge ses polices standard via `fs` : ne pas l'embarquer dans le bundle.
  serverExternalPackages: ["pdfkit", "officeparser"],
  // Playwright/CI utilisent 127.0.0.1 : autoriser les ressources dev (HMR/hydratation).
  allowedDevOrigins: ["127.0.0.1"],
  async headers() {
    return [
      {
        source: "/embed/:path*",
        headers: [
          { key: "Content-Security-Policy", value: "frame-ancestors *" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
      {
        source: "/widget/v1.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  // Le site public est un dépôt statique séparé, servi sur cms.onirtech.com.
  async redirects() {
    return [
      {
        source: "/plugins",
        destination: "https://cms.onirtech.com/plugins/",
        permanent: true,
      },
      {
        source: "/plugins/:path+",
        destination: "https://cms.onirtech.com/plugins/:path+",
        permanent: true,
      },
      {
        source: "/mentions-legales",
        destination: "https://cms.onirtech.com/mentions-legales/",
        permanent: true,
      },
      {
        source: "/confidentialite-site",
        destination: "https://cms.onirtech.com/confidentialite-site/",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
