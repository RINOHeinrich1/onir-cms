import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // pdfkit charge ses polices standard via `fs` : ne pas l'embarquer dans le bundle.
  serverExternalPackages: ["pdfkit"],
  // Playwright/CI utilisent 127.0.0.1 : autoriser les ressources dev (HMR/hydratation).
  allowedDevOrigins: ["127.0.0.1"],
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
