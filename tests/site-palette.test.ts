import { describe, expect, it } from "vitest";
import { extractSitePalette } from "@/infrastructure/web/site-palette";

describe("palette heuristique du site", () => {
  it("extrait les couleurs dominantes et leurs contextes sans navigateur", () => {
    const palette = extractSitePalette(
      [
        {
          url: "https://example.com/",
          html: `<html><head>
            <meta name="theme-color" content="#0b3b66">
            <style>
              body { background-color: #f4f7fb; color: #102a43; }
              .btn { background-color: #ff6600; color: #ffffff; }
              .card { background: #ffffff; }
            </style>
          </head><body><h1>Titre</h1><button class="btn">Action</button></body></html>`,
        },
      ],
      [],
    );
    expect(palette.confidence).not.toBe("none");
    expect(palette.candidates.some((candidate) => candidate.hex === "#0b3b66")).toBe(true);
    expect(palette.candidates.some((candidate) => candidate.contexts.includes("actions"))).toBe(
      true,
    );
    expect(palette.candidates.some((candidate) => candidate.contexts.includes("background"))).toBe(
      true,
    );
  });

  it("résout une variable CSS utilisée par un bouton", () => {
    const palette = extractSitePalette(
      [{ url: "https://example.com/", html: "<html><body><button>Go</button></body></html>" }],
      [":root { --brand: #123456; } .cta { background-color: var(--brand); }"],
    );
    expect(palette.candidates[0]?.hex).toBe("#123456");
  });
});
