import { describe, expect, it } from "vitest";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { AttachmentStorage } from "@/application/ports/attachment-storage";
import { storeConversationAttachment } from "@/application/use-cases/attachments/manage-attachments";
import type { Attachment } from "@/domain/entities/attachment";
import type { TemplateDefinition } from "@/domain/entities/chat-template";

const DEFINITION: TemplateDefinition = {
  key: "demo-fichier",
  label: "Démo fichier",
  description: "",
  systemPrompt: "x",
  fields: [
    {
      name: "cin",
      label: "CIN",
      type: "file",
      required: true,
      file: { accept: ["image/png"], maxFiles: 1, maxBytes: 1024 },
    },
  ],
  renderTemplate: "# CIN\n\n{{cin}}\n",
};

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

function build(count = 0) {
  const created: Attachment[] = [];
  const attachments = {
    countForField: async () => count,
    create: async (
      _org: string,
      input: Omit<Attachment, "id" | "organizationId" | "createdAt">,
    ) => {
      const attachment: Attachment = {
        ...input,
        id: "a1",
        organizationId: "org-1",
        createdAt: new Date(0).toISOString(),
      };
      created.push(attachment);
      return attachment;
    },
  } as unknown as AttachmentRepository;
  const storage: AttachmentStorage = {
    save: async () => "orgs/11111111-1111-1111-1111-111111111111/file.png",
    read: async () => null,
    remove: async () => undefined,
  };
  return {
    deps: {
      organizations: { findById: async () => ({ suspendedAt: null }) },
      links: { findById: async () => ({ actif: true, templateKey: "demo", templateVersion: 1 }) },
      conversations: {
        findByIdPublic: async () => ({
          id: "conv-1",
          organizationId: "org-1",
          linkId: "link-1",
          statut: "en_cours",
        }),
      },
      templates: {
        findVersion: async () => ({ definition: DEFINITION }),
      },
      attachments,
      storage,
    } as never,
    created,
  };
}

describe("storeConversationAttachment — stockage seul, sans IA", () => {
  it("stocke une pièce pour un champ fichier", async () => {
    const { deps, created } = build();
    const attachment = await storeConversationAttachment(deps, {
      conversationId: "conv-1",
      fieldName: "cin",
      fileName: "cin.png",
      data: PNG,
    });
    expect(attachment.mime).toBe("image/png");
    expect(attachment.fieldLabel).toBe("CIN");
    expect(attachment.originalName).toBe("cin.png");
    expect(created).toHaveLength(1);
  });

  it("refuse un format non autorisé", async () => {
    const { deps } = build();
    await expect(
      storeConversationAttachment(deps, {
        conversationId: "conv-1",
        fieldName: "cin",
        fileName: "cin.pdf",
        data: Buffer.from("%PDF-1.7\n"),
      }),
    ).rejects.toThrow(/Format non autorisé/);
  });

  it("refuse au-delà de maxFiles", async () => {
    const { deps } = build(1);
    await expect(
      storeConversationAttachment(deps, {
        conversationId: "conv-1",
        fieldName: "cin",
        fileName: "cin.png",
        data: PNG,
      }),
    ).rejects.toThrow(/fichier/);
  });

  it("refuse un champ non fichier", async () => {
    const { deps } = build();
    await expect(
      storeConversationAttachment(deps, {
        conversationId: "conv-1",
        fieldName: "inconnu",
        fileName: "cin.png",
        data: PNG,
      }),
    ).rejects.toThrow(/n'accepte pas/);
  });
});
