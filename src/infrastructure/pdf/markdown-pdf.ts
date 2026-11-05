/**
 * Rendu PDF depuis du Markdown (B005) — **un seul chemin PDF** pour tous les
 * modèles. Parseur minimal (`#`/`##`/`###`, puces, listes ordonnées, citations)
 * + inline (`**gras**`, `*italique*`, `` `code` ``, liens) + pdfkit
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
  | { kind: "h3"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "ordered"; text: string; number: string }
  | { kind: "quote"; text: string }
  | { kind: "paragraph"; text: string };

type InlinePart = {
  text: string;
  url?: string;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
};

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

/** Découpe un texte inline en segments texte, liens et emphases Markdown. */
export function parseInlineTokens(text: string): InlinePart[] {
  const pattern =
    /(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\))|(\*\*([^*]+)\*\*)|(__([^_]+)__)|(\*([^*\n]+)\*)|(_([^_\n]+)_)|(`([^`]+)`)/g;
  const parts: InlinePart[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ text: text.slice(cursor, index) });
    if (match[1] !== undefined) {
      parts.push({ text: match[2] ?? match[1], url: match[3] ?? "" });
    } else if (match[4] !== undefined) {
      parts.push({ text: match[5] ?? "", bold: true });
    } else if (match[6] !== undefined) {
      parts.push({ text: match[7] ?? "", bold: true });
    } else if (match[8] !== undefined) {
      parts.push({ text: match[9] ?? "", italic: true });
    } else if (match[10] !== undefined) {
      parts.push({ text: match[11] ?? "", italic: true });
    } else {
      parts.push({ text: match[13] ?? "", code: true });
    }
    cursor = index + match[0].length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor) });
  return parts.length === 0 ? [{ text }] : parts;
}

function plainInline(text: string): string {
  return parseInlineTokens(text)
    .map((part) => part.text)
    .join("");
}

function fontFor(part: InlinePart): string {
  if (part.code === true) return "Courier";
  if (part.bold === true && part.italic === true) return "Helvetica-BoldOblique";
  if (part.bold === true) return "Helvetica-Bold";
  if (part.italic === true) return "Helvetica-Oblique";
  return "Helvetica";
}

function writeInline(
  doc: PDFKit.PDFDocument,
  text: string,
  options: PDFKit.Mixins.TextOptions,
  color: string,
): void {
  const parts = parseInlineTokens(text);
  if (
    parts.length === 1 &&
    parts[0]?.url === undefined &&
    parts[0]?.bold !== true &&
    parts[0]?.italic !== true &&
    parts[0]?.code !== true
  ) {
    doc
      .font(fontFor(parts[0] ?? { text }))
      .fillColor(color)
      .text(text, options);
    return;
  }
  parts.forEach((part, index) => {
    const last = index === parts.length - 1;
    doc
      .font(fontFor(part))
      .fillColor(part.url === undefined ? color : NAVY)
      .text(part.text, {
        ...options,
        ...(part.url === undefined ? {} : { link: part.url, underline: true }),
        continued: !last,
      });
  });
}

/** Découpe un Markdown simple en blocs (titres, puces, listes, citations). */
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
    if (line.startsWith("### ")) {
      flush();
      blocks.push({ kind: "h3", text: line.slice(4).trim() });
    } else if (line.startsWith("## ")) {
      flush();
      blocks.push({ kind: "h2", text: line.slice(3).trim() });
    } else if (line.startsWith("# ")) {
      flush();
      blocks.push({ kind: "h1", text: line.slice(2).trim() });
    } else if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("+ ")) {
      flush();
      blocks.push({ kind: "bullet", text: line.slice(2).trim() });
    } else if (/^\d+\.\s+/.test(line)) {
      flush();
      const match = /^(\d+)\.\s+(.*)$/.exec(line);
      blocks.push({
        kind: "ordered",
        number: match?.[1] ?? "1",
        text: match?.[2]?.trim() ?? line,
      });
    } else if (line.startsWith("> ")) {
      flush();
      blocks.push({ kind: "quote", text: line.slice(2).trim() });
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
      } else if (block.kind === "h3") {
        doc.moveDown(0.8);
        doc.fillColor(INK).font("Helvetica-Bold").fontSize(11).text(plainInline(block.text));
        doc.moveDown(0.25);
      } else if (block.kind === "bullet") {
        doc.fillColor(INK).font("Helvetica").fontSize(10.5);
        doc.text("•  ", { indent: 6, continued: true });
        writeInline(doc, block.text, { indent: 15 }, INK);
      } else if (block.kind === "ordered") {
        doc.fillColor(INK).font("Helvetica").fontSize(10.5);
        doc.text(`${block.number}.  `, { indent: 6, continued: true });
        writeInline(doc, block.text, { indent: 15 }, INK);
      } else if (block.kind === "quote") {
        doc.fillColor(MUTED).font("Helvetica-Oblique").fontSize(10.5);
        writeInline(doc, block.text, { indent: 12 }, MUTED);
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
