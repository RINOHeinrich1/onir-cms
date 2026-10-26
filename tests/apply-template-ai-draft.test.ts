import { describe, expect, it, vi } from "vitest";
import type { TemplateAiRepository } from "@/application/ports/template-ai-repository";
import { applyTemplateAiDraft } from "@/application/use-cases/templates/apply-template-ai-draft";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import { buildDefaultRenderTemplate, buildDefaultSystemPrompt } from "@/domain/template-defaults";

const ACTOR = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
} as const;

const FIELDS = [{ name: "budget", label: "Budget", type: "text" as const, required: false }];
const DEFINITION: TemplateDefinition = {
  key: "modele",
  label: "Modèle",
  description: "Description",
  systemPrompt: buildDefaultSystemPrompt({
    role: "assistant",
    objective: "objectif",
    tone: "direct et concis",
    guardrails: ["professional"],
    fields: FIELDS,
  }),
  fields: FIELDS,
  renderTemplate: buildDefaultRenderTemplate("Modèle", FIELDS),
};

function repo() {
  return {
    apply: vi.fn(async (input) => ({
      version: {
        id: "v1",
        templateId: "t1",
        version: 1,
        definition: input.definition,
        createdBy: input.createdBy,
        createdAt: new Date(0).toISOString(),
      },
      knowledge: { created: input.knowledge.length, replaced: 0, skipped: 0, conflicts: [] },
    })),
  } satisfies TemplateAiRepository;
}

describe("applyTemplateAiDraft (ADR-0038)", () => {
  it("applique le brouillon et normalise les connaissances", async () => {
    const templatesAi = repo();
    const result = await applyTemplateAiDraft({ templatesAi }, ACTOR, {
      definition: DEFINITION,
      knowledge: [
        { titre: "Zone", contenu: "Lyon" },
        { titre: "Zone", contenu: "Doublon" },
        { titre: "Contact", contenu: "contact@example.com" },
      ],
      mergePolicy: "replace",
      generationId: "00000000-0000-4000-8000-000000000001",
    });
    expect(result.version.version).toBe(1);
    expect(templatesAi.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        mergePolicy: "replace",
        knowledge: [
          { titre: "Zone", contenu: "Lyon" },
          { titre: "Contact", contenu: "contact@example.com" },
        ],
      }),
    );
  });

  it("refuse une clé différente en édition", async () => {
    await expect(
      applyTemplateAiDraft({ templatesAi: repo() }, ACTOR, {
        templateKey: "autre",
        definition: DEFINITION,
        knowledge: [],
        mergePolicy: "append",
        generationId: "00000000-0000-4000-8000-000000000001",
      }),
    ).rejects.toThrow(/clé/i);
  });

  it("refuse une génération sans identifiant", async () => {
    await expect(
      applyTemplateAiDraft({ templatesAi: repo() }, ACTOR, {
        definition: DEFINITION,
        knowledge: [],
        mergePolicy: "append",
        generationId: "",
      }),
    ).rejects.toThrow(/génération/i);
  });
});
