import { describe, expect, it, vi } from "vitest";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ConnaissanceRepository } from "@/application/ports/connaissance-repository";
import type { DocumentTextExtractor } from "@/application/ports/document-text-extractor";
import type { WebsiteContextReader } from "@/application/ports/website-context-reader";
import {
  generateTemplateAiDraft,
  type TemplateAiGenerationDependencies,
} from "@/application/use-cases/templates/generate-template-ai-draft";
import type { ChatTemplate, ChatTemplateVersion } from "@/domain/entities/chat-template";

const ACTOR = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
} as const;

const AI_JSON = JSON.stringify({
  label: "Rénovation",
  description: "Qualifier les projets de rénovation.",
  role: "l'assistant de qualification",
  objective: "Comprendre le besoin.",
  tone: "professionnel et chaleureux",
  guardrails: ["professional", "one_question"],
  fields: [
    { label: "Type de projet", type: "select", required: true, options: ["Salle de bain"] },
    { label: "Surface", type: "text", required: false, example: "8 m²" },
  ],
  knowledge: [{ titre: "Zone", contenu: "Lyon." }],
});

function template(key: string): ChatTemplate {
  return {
    id: `id-${key}`,
    organizationId: "org-1",
    key,
    label: key,
    description: "",
    createdBy: null,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
  };
}

function version(key: string): ChatTemplateVersion {
  return {
    id: `v-${key}`,
    templateId: `id-${key}`,
    version: 1,
    definition: {
      key,
      label: key,
      description: "",
      systemPrompt: "Prompt",
      fields: [{ name: "budget", label: "Budget", type: "text", required: false }],
      renderTemplate: "# Fiche\n\n{{budget}}",
    },
    createdBy: null,
    createdAt: new Date(0).toISOString(),
  };
}

function templates(existing: ChatTemplate | null = null): ChatTemplateRepository {
  return {
    list: async () => (existing === null ? [] : [existing]),
    findByKey: async () => existing,
    findVersion: async () => null,
    currentVersion: async () => (existing === null ? null : version(existing.key)),
    createTemplate: vi.fn(),
    addVersion: vi.fn(),
    deleteTemplate: async () => false,
    listKeysReferencedByLinks: async () => [],
    listKeysReferencedByFiches: async () => [],
  };
}

function connaissances(count = 0): ConnaissanceRepository {
  const missing = async () => null;
  return {
    findById: missing,
    findByTitre: missing,
    list: async () => [],
    listActives: async () => [],
    create: vi.fn(),
    countAiByTemplate: async () => count,
    update: missing,
    delete: async () => false,
  };
}

function deps(
  options: {
    existing?: ChatTemplate | null;
    aiCount?: number;
    documents?: DocumentTextExtractor;
    websites?: WebsiteContextReader;
  } = {},
): TemplateAiGenerationDependencies {
  const aiFactory: AiClientFactory = {
    resolve: async () => ({
      organizationId: "org-1",
      providerId: "provider-1",
      providerLabel: "Fournisseur test",
      model: "model-test",
      source: "organization",
    }),
    forTarget: async () => ({
      complete: async () => AI_JSON,
    }),
    optionalTarget: async () => null,
  };
  return {
    aiFactory,
    templates: templates(options.existing ?? null),
    connaissances: connaissances(options.aiCount ?? 0),
    documents:
      options.documents ??
      ({
        extract: async (input) => ({
          name: input.name,
          mime: input.mime,
          text: "Entreprise Dupont à Lyon",
          chars: 23,
          truncated: false,
          warnings: [],
        }),
      } satisfies DocumentTextExtractor),
    websites:
      options.websites ??
      ({
        read: async (url) => ({
          startUrl: url,
          pages: [{ url, title: "Accueil", text: "Rénovation à Lyon" }],
          chars: 18,
          truncated: false,
          warnings: [],
        }),
      } satisfies WebsiteContextReader),
  };
}

describe("generateTemplateAiDraft (ADR-0038)", () => {
  it("génère un brouillon sans écrire et avec les sources", async () => {
    const result = await generateTemplateAiDraft(deps(), ACTOR, {
      description: "Qualification rénovation",
      websiteUrl: "https://example.com",
      files: [{ name: "brief.md", mime: "text/markdown", bytes: new Uint8Array([1]) }],
      providerId: "provider-1",
      model: "model-test",
      crawl: { maxPages: 3, maxDepth: 2 },
    });
    expect(result.key).toBe("renovation");
    expect(result.draft.fields[0]?.name).toBe("type_de_projet");
    expect(result.draft.knowledge).toHaveLength(1);
    expect(result.sources.files[0]?.chars).toBe(23);
    expect(result.sources.pages[0]?.title).toBe("Accueil");
    expect(result.existingAiKnowledgeCount).toBe(0);
    expect(result.providerLabel).toBe("Fournisseur test");
  });

  it("conserve la clé et expose le nombre de connaissances IA en édition", async () => {
    const result = await generateTemplateAiDraft(
      deps({ existing: template("renovation"), aiCount: 2 }),
      ACTOR,
      {
        description: "Mise à jour",
        files: [],
        templateKey: "renovation",
      },
    );
    expect(result.key).toBe("renovation");
    expect(result.existingAiKnowledgeCount).toBe(2);
  });

  it("refuse une description vide", async () => {
    await expect(
      generateTemplateAiDraft(deps(), ACTOR, { description: "", files: [] }),
    ).rejects.toThrow(/description/i);
  });

  it("refuse un fournisseur sans modèle", async () => {
    await expect(
      generateTemplateAiDraft(deps(), ACTOR, {
        description: "Test",
        files: [],
        providerId: "provider-1",
      }),
    ).rejects.toThrow(/fournisseur et le modèle/i);
  });
});
