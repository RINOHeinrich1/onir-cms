/**
 * Détection des formats de pièces jointes (ADR-0034) — aucune confiance dans
 * l'extension ou le Content-Type déclaré par le navigateur. Fonction pure.
 */

import type { AttachmentMime } from "@/domain/entities/attachment";

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  if (bytes.length < signature.length) return false;
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  let out = "";
  for (let index = 0; index < length && start + index < bytes.length; index += 1) {
    out += String.fromCharCode(bytes[start + index] ?? 0);
  }
  return out;
}

function containsAscii(bytes: Uint8Array, needle: string): boolean {
  const length = needle.length;
  if (length === 0 || bytes.length < length) return false;
  for (let index = 0; index <= bytes.length - length; index += 1) {
    let match = true;
    for (let offset = 0; offset < length; offset += 1) {
      if (bytes[index + offset] !== needle.charCodeAt(offset)) {
        match = false;
        break;
      }
    }
    if (match) return true;
  }
  return false;
}

function looksLikeUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  // Les fichiers binaires contiennent presque toujours un octet NUL.
  for (const value of bytes) {
    if (value === 0) return false;
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/**
 * Retourne le MIME réel détecté, ou null si le format n'est pas autorisé.
 * DOCX est un ZIP : on vérifie la signature et la présence des entrées Word
 * (sans extraction, donc sans risque de zip bomb).
 */
export function detectAttachmentMime(bytes: Uint8Array): AttachmentMime | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") return "image/webp";

  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    if (containsAscii(bytes, "[Content_Types].xml") && containsAscii(bytes, "word/document.xml")) {
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    }
    return null;
  }

  if (looksLikeUtf8Text(bytes)) return "text/plain";
  return null;
}
