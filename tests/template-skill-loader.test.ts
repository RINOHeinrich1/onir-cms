import { describe, expect, it } from "vitest";
import type { MediaStorage } from "@/application/ports/media-storage";
import type { TemplateHasher } from "@/application/ports/template-archive";
import type {
  VisualTemplateRepository,
  VisualTemplateVersion,
} from "@/application/ports/visual-template-repository";
import type { TemplateManifest } from "@/domain/entities/visual-template";
import { TEMPLATE_SKILL_FORMAT } from "@/domain/template-skill";
import { nodeTemplateHasher } from "@/infrastructure/crypto/sha256";
import { createTemplateSkillLoader } from "@/infrastructure/visual-templates/template-skill-loader";

const hasher = nodeTemplateHasher();

function skillBytes(): Buffer {
  return Buffer.from(
    JSON.stringify({
      schemaVersion: 1,
      format: TEMPLATE_SKILL_FORMAT,
      id: "puzzle-style-button",
      title: "Style du bouton",
      description: "Modifier le fond d’un bouton.",
      version: "1.0.0",
      priority: 10,
      always: false,
      intents: [
        {
          id: "change-button-background",
          description: "Changer le fond d’un bouton",
          keywords: ["bouton", "fond"],
          examples: ["change le fond du bouton"],
        },
      ],
      instructions: ["Créer une copie locale du style."],
      context: { include: ["references"], maxCandidates: 8 },
      operations: { allowed: ["insert", "set"], constraints: [] },
      examples: [{ request: "change le fond du bouton" }],
    }),
  );
}

function fixture(overrides?: { bytes?: Buffer; badIntegrity?: boolean }) {
  const bytes = overrides?.bytes ?? skillBytes();
  const integrity = overrides?.badIntegrity
    ? `sha256-${hasher.sha256Base64(Buffer.from("autre"))}`
    : `sha256-${hasher.sha256Base64(bytes)}`;
  const manifest = {
    aiSkills: [
      {
        id: "puzzle-style-button",
        format: TEMPLATE_SKILL_FORMAT,
        path: "skills/puzzle-style-button.skill.json",
        integrity,
      },
    ],
  } as TemplateManifest;
  let reads = 0;
  const storage: MediaStorage = {
    save: async () => "key",
    read: async () => {
      reads += 1;
      return { data: bytes, contentType: "application/json" };
    },
    remove: async () => undefined,
  };
  const templates = {
    findVersion: async () => ({ id: "version-1", manifest }) as VisualTemplateVersion,
    findAsset: async () => ({
      id: "asset-1",
      versionId: "version-1",
      path: "skills/puzzle-style-button.skill.json",
      storageKey: "skill-key",
      sha256: "sha",
      size: bytes.byteLength,
      mime: "application/json",
    }),
  } as unknown as VisualTemplateRepository;
  return {
    loader: createTemplateSkillLoader({ templates, storage, hasher: hasher as TemplateHasher }),
    reads: () => reads,
  };
}

describe("loader de skills de template", () => {
  it("charge une skill depuis la version installée et la met en cache", async () => {
    const { loader, reads } = fixture();
    const first = await loader.load("template-1", "1.0.0");
    const second = await loader.load("template-1", "1.0.0");
    expect(first[0]?.skill.id).toBe("puzzle-style-button");
    expect(second).toBe(first);
    expect(reads()).toBe(1);
  });

  it("refuse une intégrité de skill invalide", async () => {
    const { loader } = fixture({ badIntegrity: true });
    await expect(loader.load("template-1", "1.0.0")).rejects.toThrow("Intégrité");
  });
});
