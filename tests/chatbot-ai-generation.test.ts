import { describe, expect, it, vi } from "vitest";
import type { AiClient, AiCompletionInput } from "@/application/ports/ai-client";
import type { AiClientFactory, ResolvedAiTarget } from "@/application/ports/ai-client-factory";
import type { DocumentTextExtractor } from "@/application/ports/document-text-extractor";
import type { WebsiteContextReader } from "@/application/ports/website-context-reader";
import {
  CHATBOT_AI_TOKEN_BUDGETS,
  generateChatbotAiDraft,
} from "@/application/use-cases/chatbots/generate-chatbot-ai-draft";
import { chatbotConfigDraftFromAi } from "@/components/links/chatbot-config-draft";

const ACTOR = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
} as const;

const AI_FORMS_JSON = JSON.stringify({
  label: "Inscription formation",
  description: "Inscrire un étudiant à plusieurs modules.",
  role: "l'assistant d'inscription",
  objective: "Collecter l'inscription et les modules.",
  tone: "clair",
  guardrails: [],
  rootFormKey: "inscription",
  forms: [
    {
      key: "module",
      label: "Module",
      description: "",
      intent: "",
      fields: [
        { label: "Nom du module", type: "text", required: true },
        { label: "Crédits", type: "number", required: true },
      ],
    },
    {
      key: "inscription",
      label: "Inscription",
      description: "",
      intent: "",
      fields: [
        { label: "Étudiant", type: "text", required: true },
        {
          label: "Modules",
          type: "tableau_de_fiches",
          ficheKey: "module",
          required: true,
        },
      ],
    },
  ],
  knowledge: [],
});

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

function resolvedTarget(): ResolvedAiTarget {
  return {
    organizationId: "org-1",
    providerId: "provider-1",
    providerLabel: "Test",
    model: "model-1",
    source: "organization",
    preset: "deepseek",
    reasoningMode: "auto",
  };
}

function factory(complete: (input: AiCompletionInput) => Promise<string>): AiClientFactory {
  const client: AiClient = { complete };
  return {
    resolve: async () => resolvedTarget(),
    forTarget: async () => client,
    optionalTarget: async () => client,
  };
}

describe("génération IA de chatbot", () => {
  it("passe structured et retente 4000 → 8000 → 12000 après réponse vide", async () => {
    const complete = vi
      .fn<(input: AiCompletionInput) => Promise<string>>()
      .mockRejectedValueOnce(new Error("Réponse IA vide"))
      .mockRejectedValueOnce(new Error("Réponse IA vide"))
      .mockResolvedValueOnce(AI_JSON);

    const result = await generateChatbotAiDraft(
      {
        aiFactory: factory(complete),
        documents: { extract: vi.fn() } as unknown as DocumentTextExtractor,
        websites: { read: vi.fn() } as unknown as WebsiteContextReader,
      },
      ACTOR,
      { description: "Créer un assistant de rénovation.", files: [] },
    );

    expect(result.draft.label).toBe("Rénovation");
    expect(result.draft.fields).toHaveLength(2);
    expect(complete.mock.calls.map(([input]) => input.maxTokens)).toEqual([
      ...CHATBOT_AI_TOKEN_BUDGETS,
    ]);
    expect(complete.mock.calls.every(([input]) => input.structured === true)).toBe(true);
  });

  it("conserve une composition de formulaires proposée par l'IA", async () => {
    const complete = vi
      .fn<(input: AiCompletionInput) => Promise<string>>()
      .mockResolvedValue(AI_FORMS_JSON);
    const result = await generateChatbotAiDraft(
      {
        aiFactory: factory(complete),
        documents: { extract: vi.fn() } as unknown as DocumentTextExtractor,
        websites: { read: vi.fn() } as unknown as WebsiteContextReader,
      },
      ACTOR,
      { description: "Créer une inscription à des modules.", files: [] },
    );
    expect(result.draft.rootFormKey).toBe("inscription");
    expect(result.draft.forms).toHaveLength(2);
    expect(result.draft.fields.some((field) => field.type === "tableau_de_fiches")).toBe(true);
    expect(result.draft.forms?.find((form) => form.key === "module")?.fields).toHaveLength(2);
    const config = chatbotConfigDraftFromAi(result.draft);
    expect(config.fiches).toHaveLength(1);
    expect(config.fiches[0]?.subFiches).toHaveLength(1);
    expect(config.fiches[0]?.subFiches?.[0]?.fields).toHaveLength(2);
  });

  it("propage le cluster partagé au client IA", async () => {
    const complete = vi
      .fn<(input: AiCompletionInput) => Promise<string>>()
      .mockResolvedValue(AI_JSON);
    let seenTarget: Parameters<AiClientFactory["forTarget"]>[0] = null;
    const usedFactory: AiClientFactory = {
      resolve: async () => resolvedTarget(),
      resolveForUsage: async () => ({ ...resolvedTarget(), clusterId: "cluster-1" }),
      forTarget: async (target) => {
        seenTarget = target;
        return { complete };
      },
      optionalTarget: async () => ({ complete }),
    };

    await generateChatbotAiDraft(
      {
        aiFactory: usedFactory,
        documents: { extract: vi.fn() } as unknown as DocumentTextExtractor,
        websites: { read: vi.fn() } as unknown as WebsiteContextReader,
      },
      ACTOR,
      { description: "Créer un assistant.", files: [] },
    );

    expect(seenTarget).toMatchObject({
      aiProviderId: "provider-1",
      aiModel: "model-1",
      aiClusterId: "cluster-1",
    });
  });

  it("retente après un contenu non JSON, puis réussit", async () => {
    const complete = vi
      .fn<(input: AiCompletionInput) => Promise<string>>()
      .mockResolvedValueOnce("Je ne peux pas produire ce JSON.")
      .mockResolvedValueOnce(AI_JSON);

    const result = await generateChatbotAiDraft(
      {
        aiFactory: factory(complete),
        documents: { extract: vi.fn() } as unknown as DocumentTextExtractor,
        websites: { read: vi.fn() } as unknown as WebsiteContextReader,
      },
      ACTOR,
      { description: "Créer un assistant.", files: [] },
    );

    expect(result.draft.label).toBe("Rénovation");
    expect(complete.mock.calls.map(([input]) => input.maxTokens)).toEqual([4_000, 8_000]);
  });
});
