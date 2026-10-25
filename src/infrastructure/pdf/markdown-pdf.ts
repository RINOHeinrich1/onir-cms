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

type InlinePart = { text: string; url?: string };

/** Découpe un texte inline en segments texte / liens Markdown http(s). */
export function parseInlineLinks(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const pattern = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g;
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ text: text.slice(cursor, index) });
    parts.push({ text: match[1] ?? match[0], url: match[2] ?? "" });
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts.length === 0 ? [{ text }] : parts;
}

function plainInline(text: string): string {
  return parseInlineLinks(text)
    .map((part) => part.text)
    .join("");
}

function writeInline(
  doc: PDFKit.PDFDocument,
  text: string,
  options: PDFKit.Mixins.TextOptions,
  color: string,
): void {
  const parts = parseInlineLinks(text);
  if (parts.length === 1 && parts[0]?.url === undefined) {
    doc.fillColor(color).text(text, options);
    return;
  }
  parts.forEach((part, index) => {
    const last = index === parts.length - 1;
    doc.fillColor(part.url === undefined ? color : NAVY).text(part.text, {
      ...options,
      ...(part.url === undefined ? {} : { link: part.url, underline: true }),
      continued: !last,
    });
  });
}

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
        doc.fillColor(NAVY).font("Helvetica-Bold").fontSize(20).text(plainInline(block.text));
        doc.moveDown(0.3);
      } else if (block.kind === "h2") {
        doc.moveDown(1.1);
        doc
          .fillColor(NAVY)
          .font("Helvetica-Bold")
          .fontSize(12.5)
          .text(plainInline(block.text).toUpperCase());
        doc.moveDown(0.35);
      } else if (block.kind === "bullet") {
        doc.fillColor(INK).font("Helvetica").fontSize(10.5);
        doc.text("•  ", { indent: 6, continued: true });
        writeInline(doc, block.text, { indent: 15 }, INK);
      } else {
        doc.font("Helvetica").fontSize(10.5);
        writeInline(doc, block.text, {}, INK);
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
