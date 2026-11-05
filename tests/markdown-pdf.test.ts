import { describe, expect, it } from "vitest";
import {
  parseInlineLinks,
  parseInlineTokens,
  parseMarkdownBlocks,
  renderMarkdownPdf,
} from "@/infrastructure/pdf/markdown-pdf";

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

  it("interprète les titres de niveau 3, listes ordonnées et citations", () => {
    expect(parseMarkdownBlocks("### Détail\n\n1. Premier\n2. Second\n\n> Note")).toEqual([
      { kind: "h3", text: "Détail" },
      { kind: "ordered", number: "1", text: "Premier" },
      { kind: "ordered", number: "2", text: "Second" },
      { kind: "quote", text: "Note" },
    ]);
  });
});

describe("parseInlineTokens", () => {
  it("interprète gras, italique, code et liens", () => {
    expect(parseInlineTokens("- **Nom** : *hôtel* `25` [site](https://example.test)")).toEqual([
      { text: "- " },
      { text: "Nom", bold: true },
      { text: " : " },
      { text: "hôtel", italic: true },
      { text: " " },
      { text: "25", code: true },
      { text: " " },
      { text: "site", url: "https://example.test" },
    ]);
  });
});

describe("parseInlineLinks", () => {
  it("isole les liens http(s) et conserve le texte", () => {
    expect(parseInlineLinks("- [cv.pdf](https://cms.example/api/file)")).toEqual([
      { text: "- " },
      { text: "cv.pdf", url: "https://cms.example/api/file" },
    ]);
  });

  it("laisse les liens non http(s) en texte", () => {
    expect(parseInlineLinks("[x](javascript:alert(1))")).toEqual([
      { text: "[x](javascript:alert(1))" },
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

  it("produit un PDF avec du gras et des puces Markdown", async () => {
    const pdf = await renderMarkdownPdf(
      "# Hôtel\n\n- **Nom de l'établissement** : Hôtel Analamanga\n- **Services** : spa\n",
      "Fiche — Hôtel",
    );
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(800);
  });

  it("produit un PDF avec un lien de pièce jointe", async () => {
    const pdf = await renderMarkdownPdf(
      "# CIN\n\n- [cin.png](https://cms-backoffice.onirtech.com/api/chat/attachments/a1/file)\n",
      "Fiche — CIN",
    );
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.includes(Buffer.from("/URI"))).toBe(true);
  });
});
