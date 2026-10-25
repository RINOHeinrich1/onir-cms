import { describe, expect, it } from "vitest";
import { buildAttachmentPromptContext } from "@/application/use-cases/attachments/attachment-prompt";
import type { Attachment } from "@/domain/entities/attachment";
import type { TemplateField } from "@/domain/entities/chat-template";

const FIELDS: TemplateField[] = [
  {
    name: "cv",
    label: "CV",
    type: "file",
    required: true,
    file: { accept: ["application/pdf"], maxFiles: 1, maxBytes: 1024 },
  },
  {
    name: "portfolio",
    label: "Portfolio",
    type: "file",
    required: false,
    file: { accept: ["application/pdf"], maxFiles: 1, maxBytes: 1024 },
  },
];

const ATTACHMENT: Attachment = {
  id: "a1",
  organizationId: "org",
  conversationId: "conv",
  messageId: "m1",
  fieldName: "cv",
  fieldLabel: "CV",
  originalName: "cv.pdf",
  mime: "application/pdf",
  sizeBytes: 10,
  storageKey: "key",
  sha256: "hash",
  createdAt: new Date(0).toISOString(),
};

describe("buildAttachmentPromptContext — l'IA demande les fichiers", () => {
  it("indique les pièces reçues et manquantes sans contenu", () => {
    const context = buildAttachmentPromptContext(FIELDS, [ATTACHMENT]);
    expect(context).toContain("CV (obligatoire) : reçu (cv.pdf)");
    expect(context).toContain("Portfolio (facultatif) : manquant");
    expect(context).toContain("demande-le explicitement");
    expect(context).not.toContain("contenu du CV");
  });

  it("ne produit rien sans champ fichier", () => {
    expect(buildAttachmentPromptContext([], [])).toBe("");
  });
});
