import { describe, expect, it } from "vitest";
import { parseMarkdownBlocks, renderMarkdownPdf } from "@/infrastructure/pdf/markdown-pdf";

describe("parseMarkdownBlocks", () => {
  it("découpe titres, puces et paragraphes", () => {
    expect(
      parseMarkdownBlocks("# Titre\n\nParagraphe un deux.\n\n- a\n- b\n\n## Sous\n\nFin."),
    ).toEqual([
      { kind: "h1", text: "Titre" },
      { kind: "paragraph", text: "Paragraphe un deux." },
      { kind: "bullet", text: "a" },
      { kind: "bullet", text: "b" },
      { kind: "h2", text: "Sous" },
      { kind: "paragraph", text: "Fin." },
    ]);
  });
});

describe("renderMarkdownPdf", () => {
  it("produit un PDF valide avec accents", async () => {
    const pdf = await renderMarkdownPdf(
      "# Fiche de prospection — Onirtech\n\nÉdité avec des accents : éàçù.\n\n- site web\n- SaaS\n",
      "Fiche — Onirtech",
    );
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(800);
  });
});
