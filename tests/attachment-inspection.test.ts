import { describe, expect, it } from "vitest";
import { detectAttachmentMime } from "@/domain/attachment-inspection";
import { normalizeFileConstraints, sanitizeOriginalName } from "@/domain/entities/attachment";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const PDF = new TextEncoder().encode("%PDF-1.7\n");
const TEXT = new TextEncoder().encode("Bonjour, pièce justificative.");

describe("detectAttachmentMime — signature réelle", () => {
  it("détecte les formats autorisés", () => {
    expect(detectAttachmentMime(PNG)).toBe("image/png");
    expect(detectAttachmentMime(JPEG)).toBe("image/jpeg");
    expect(detectAttachmentMime(PDF)).toBe("application/pdf");
    expect(detectAttachmentMime(TEXT)).toBe("text/plain");
  });

  it("refuse les formats non autorisés", () => {
    expect(detectAttachmentMime(new Uint8Array([0x4d, 0x5a, 0x90]))).toBeNull();
    expect(detectAttachmentMime(new Uint8Array([0x3c, 0x68, 0x74, 0x6d, 0x6c]))).toBe("text/plain");
  });
});

describe("normalizeFileConstraints", () => {
  it("normalise les contraintes valides", () => {
    expect(
      normalizeFileConstraints({
        accept: ["image/png", "application/pdf"],
        maxFiles: 2,
        maxBytes: 2048,
      }),
    ).toEqual({
      ok: true,
      value: { accept: ["image/png", "application/pdf"], maxFiles: 2, maxBytes: 2048 },
    });
  });

  it("refuse un MIME inconnu, un tableau vide ou une borne invalide", () => {
    expect(normalizeFileConstraints({ accept: ["application/zip"] }).ok).toBe(false);
    expect(normalizeFileConstraints({ accept: [] }).ok).toBe(false);
    expect(normalizeFileConstraints({ accept: ["image/png"], maxFiles: 99 }).ok).toBe(false);
    expect(normalizeFileConstraints({ accept: ["image/png"], maxBytes: 0 }).ok).toBe(false);
  });
});

describe("sanitizeOriginalName", () => {
  it("retire le chemin et les caractères de contrôle", () => {
    expect(sanitizeOriginalName("../../etc/CIN\u0000.pdf")).toBe("CIN.pdf");
    expect(sanitizeOriginalName("   ")).toBe("fichier");
  });
});
