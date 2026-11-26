import { describe, expect, it } from "vitest";
import { validateTemplateSkillsArchive } from "@/application/use-cases/visual-templates/validate-template-skills";
import type { TemplateManifest } from "@/domain/entities/visual-template";
import {
  TEMPLATE_SKILL_FORMAT,
  validateTemplateAiSkill,
  validateTemplateAiSkillRefs,
} from "@/domain/template-skill";
import { nodeTemplateHasher } from "@/infrastructure/crypto/sha256";

const hasher = nodeTemplateHasher();

function skill(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1 as const,
    format: TEMPLATE_SKILL_FORMAT as typeof TEMPLATE_SKILL_FORMAT,
    id: "puzzle-style-button",
    title: "Style du bouton",
    description: "Modifier le fond d’un bouton",
    version: "1.0.0",
    priority: 10,
    always: false,
    intents: [
      {
        id: "change-button-background",
        description: "Changer le fond d’un bouton",
        keywords: ["bouton", "fond", "couleur"],
        examples: ["change le fond du bouton"],
      },
    ],
    instructions: ["Créer une copie locale du style."],
    context: { include: ["references"], maxCandidates: 8 },
    operations: { allowed: ["insert", "set"], constraints: ["pas d’ID inventé"] },
    examples: [{ request: "change le fond du bouton" }],
    ...overrides,
  };
}

describe("schéma des skills de template", () => {
  it("valide un skill et ses références", () => {
    const content = Buffer.from(JSON.stringify(skill()));
    const integrity = `sha256-${hasher.sha256Base64(content)}`;
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
    const files = new Map([["skills/puzzle-style-button.skill.json", content]]);
    expect(validateTemplateAiSkill(skill()).ok).toBe(true);
    expect(validateTemplateSkillsArchive(files, manifest, hasher)).toHaveLength(1);
  });

  it("refuse un chemin de skill dangereux", () => {
    const refs = validateTemplateAiSkillRefs([
      {
        id: "bad",
        format: TEMPLATE_SKILL_FORMAT,
        path: "../skills/bad.json",
        integrity: "sha256-aaaa",
      },
    ]);
    expect(refs.ok).toBe(false);
  });

  it("refuse un skill dont l’id ne correspond pas à la référence", () => {
    const content = Buffer.from(JSON.stringify(skill()));
    const integrity = `sha256-${hasher.sha256Base64(content)}`;
    const manifest = {
      aiSkills: [
        {
          id: "autre-id",
          format: TEMPLATE_SKILL_FORMAT,
          path: "skills/puzzle-style-button.skill.json",
          integrity,
        },
      ],
    } as TemplateManifest;
    expect(() =>
      validateTemplateSkillsArchive(
        new Map([["skills/puzzle-style-button.skill.json", content]]),
        manifest,
        hasher,
      ),
    ).toThrow();
  });
});
