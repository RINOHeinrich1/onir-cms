/**
 * Extraction du texte des documents envoyés à l'assistance IA (ADR-0038).
 * Aucun fichier n'est conservé : les octets sont traités en mémoire.
 */

import { extname } from "node:path";
import { type OfficeIssue, parseOffice, type SupportedFileType } from "officeparser";
import { BadGatewayError, ValidationError } from "@/application/errors";
import type {
  DocumentInput,
  DocumentTextExtractor,
  ExtractedDocument,
} from "@/application/ports/document-text-extractor";

const MAX_EXTRACTED_CHARS = 20_000;
const MAX_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 1_000;
const MAX_TABLE_CELLS = 10_000;

const EXTENSIONS = new Map<string, SupportedFileType>([
  [".pdf", "pdf"],
  [".docx", "docx"],
  [".odt", "odt"],
  [".md", "md"],
  [".markdown", "md"],
  [".rtf", "rtf"],
]);

const MIME_BY_EXTENSION: Record<string, readonly string[]> = {
  ".pdf": ["application/pdf"],
  ".docx": ["application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  ".odt": ["application/vnd.oasis.opendocument.text"],
  ".md": ["text/markdown", "text/plain", "text/x-markdown", ""],
  ".markdown": ["text/markdown", "text/plain", "text/x-markdown", ""],
  ".rtf": ["application/rtf", "text/rtf", "text/plain", ""],
};

function normalizeText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replaceAll("\u0000", "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function warningText(issue: OfficeIssue): string {
  if (typeof issue === "string") return issue;
  if (issue !== null && typeof issue === "object" && "message" in issue) {
    const message = (issue as { message?: unknown }).message;
    if (typeof message === "string" && message.trim() !== "") return message.trim();
  }
  return "Avertissement de lecture du document";
}

type OfficeDocumentExtractorOptions = {
  /** Injectable pour les tests (évite de dépendre de la librairie dans les tests). */
  parse?: typeof parseOffice;
};

export function officeDocumentExtractor(
  options: OfficeDocumentExtractorOptions = {},
): DocumentTextExtractor {
  const parse = options.parse ?? parseOffice;

  return {
    async extract(input: DocumentInput): Promise<ExtractedDocument> {
      const extension = extname(input.name).toLowerCase();
      const fileType = EXTENSIONS.get(extension);
      if (fileType === undefined) {
        throw new ValidationError(
          "Format non pris en charge : utilisez PDF, DOCX, ODT, Markdown ou RTF",
        );
      }
      const allowedMimes = MIME_BY_EXTENSION[extension] ?? [];
      if (input.mime !== "" && !allowedMimes.includes(input.mime)) {
        throw new ValidationError(`Type de fichier incohérent pour « ${input.name} »`);
      }

      const warnings: string[] = [];
      try {
        const ast = await parse(Buffer.from(input.bytes), {
          fileType,
          ocr: false,
          extractAttachments: false,
          includeRawContent: false,
          ignoreComments: true,
          ignoreHeadersAndFooters: true,
          ignoreNotes: true,
          ignorePageGeometry: true,
          allowRemoteAssets: false,
          decompressionLimits: {
            maxUncompressedBytes: MAX_UNCOMPRESSED_BYTES,
            maxZipEntries: MAX_ZIP_ENTRIES,
            maxTableCells: MAX_TABLE_CELLS,
          },
          onWarning: (issue) => {
            const message = warningText(issue);
            if (message !== "" && warnings.length < 8) warnings.push(message);
          },
        });
        const converted = await ast.to("text", {
          includeImages: false,
          textConfig: { preserveLayout: false, renderNotes: false },
        });
        const text = normalizeText(converted.value);
        if (text === "") {
          warnings.push(
            "Aucun texte extrait : le document est peut-être scanné ou ne contient pas de texte exploitable.",
          );
        }
        const truncated = text.length > MAX_EXTRACTED_CHARS;
        const limited = truncated ? text.slice(0, MAX_EXTRACTED_CHARS) : text;
        if (truncated) {
          warnings.push(
            `Texte tronqué à ${MAX_EXTRACTED_CHARS.toLocaleString("fr-FR")} caractères.`,
          );
        }
        return {
          name: input.name,
          mime: input.mime,
          text: limited,
          chars: limited.length,
          truncated,
          warnings,
        };
      } catch (error) {
        if (error instanceof ValidationError) throw error;
        throw new BadGatewayError(
          `Lecture impossible de « ${input.name} » : vérifiez que le fichier n'est pas protégé par mot de passe ou corrompu.`,
        );
      }
    },
  };
}
