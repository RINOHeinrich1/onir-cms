/**
 * Rendu PDF depuis du Markdown (B005) — **un seul chemin PDF** pour tous les
 * modèles. Parseur minimal (`#`/`##`, puces `-`, paragraphes) + pdfkit
 * (charte NAVY/ORANGE). Remplace `fiche-pdf.ts` (rendu ad hoc).
 */

import PDFDocument from "pdfkit";

const NAVY = "#023777";
const ORANGE = "#FCAD28";
const INK = "#0B2247";
const MUTED = "#4A5A78";

type Block =
  | { kind: "h1"; text: string }
  | { kind: "h2"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "paragraph"; text: string };

/** Découpe un Markdown simple en blocs (titres, puces, paragraphes). */
export function parseMarkdownBlocks(markdown: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];

  const flush = (): void => {
    const text = paragraph.join(" ").trim();
    if (text !== "") blocks.push({ kind: "paragraph", text });
    paragraph = [];
  };

  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trim();
    if (line.startsWith("# ")) {
      flush();
      blocks.push({ kind: "h1", text: line.slice(2).trim() });
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "h2", text: line.slice(3).trim() });
    } else if (line.startsWith("- ")) {
      flush();
      blocks.push({ kind: "bullet", text: line.slice(2).trim() });
    } else if (line === "") {
      flush();
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}

/** Construit le PDF (A4) d'un Markdown et renvoie son contenu binaire. */
export function renderMarkdownPdf(markdown: string, title: string): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 56,
      info: { Title: title, Author: "ONIR CMS" },
    });
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc.rect(0, 0, doc.page.width, 8).fill(ORANGE);
    doc.moveDown(2);

    for (const block of parseMarkdownBlocks(markdown)) {
      if (block.kind === "h1") {
        doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(20).text(block.text);
        doc.moveDown(0.3);
      } else if (block.kind === "h2") {
        doc.moveDown(1.1);
        doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(12.5).text(block.text.toUpperCase());
        doc.moveDown(0.35);
      } else if (block.kind === "bullet") {
        doc.fillColor(INK).font("Helvetica").fontSize(10.5).text(`•  ${block.text}`, { indent: 6 });
      } else {
        doc.fillColor(INK).font("Helvetica").fontSize(10.5).text(block.text);
      }
    }

    doc
      .fillColor(MUTED)
      .font("Helvetica")
      .fontSize(9.5)
      .text("Document généré par ONIR CMS", { align: "center" });

    doc.end();
  });
}
