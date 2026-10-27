import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const HTML = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="robots" content="noindex" />
    <title>ONIR CMS — API Swagger</title>
    <link rel="stylesheet" href="/api/v1/docs/assets/swagger-ui.css" />
    <style>
      html { box-sizing: border-box; overflow-y: scroll; }
      *, *::before, *::after { box-sizing: inherit; }
      body { margin: 0; background: #fafafa; }
      .swagger-ui .topbar { display: none; }
      .onir-api-head {
        display: flex; align-items: center; justify-content: space-between; gap: 1rem;
        padding: 1rem 2rem; background: #023777; color: #fff;
        font-family: ui-sans-serif, system-ui, sans-serif;
      }
      .onir-api-head strong { font-size: 1.05rem; letter-spacing: .02em; }
      .onir-api-head a { color: #fff; font-size: .85rem; }
    </style>
  </head>
  <body>
    <header class="onir-api-head">
      <strong>ONIR CMS — API v1</strong>
      <a href="/documentation/api">Documentation</a>
    </header>
    <div id="swagger-ui"></div>
    <script src="/api/v1/docs/assets/swagger-ui-bundle.js"></script>
    <script src="/api/v1/docs/assets/swagger-ui-standalone-preset.js"></script>
    <script>
      window.onload = function () {
        window.ui = SwaggerUIBundle({
          url: "/api/v1/openapi.json",
          dom_id: "#swagger-ui",
          deepLinking: true,
          displayRequestDuration: true,
          filter: true,
          persistAuthorization: true,
          tryItOutEnabled: true,
          presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
          plugins: [SwaggerUIBundle.plugins.DownloadUrl],
          layout: "BaseLayout",
          docExpansion: "list"
        });
      };
    </script>
  </body>
</html>`;

export function GET(): NextResponse {
  return new NextResponse(HTML, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
