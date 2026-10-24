import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AiProviderModelRepository } from "@/application/ports/ai-model-repository";
import type { AiProviderRepository } from "@/application/ports/ai-provider-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ProspectRepository } from "@/application/ports/prospect-repository";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";
import { createChatLink } from "@/application/use-cases/links/create-chat-link";
import { sealAiKey } from "@/lib/ai-crypto";
import { memoryAiModelRepository } from "./helpers/ai-model-memory";
import { memoryAiProviderRepository } from "./helpers/ai-provider-memory";

const ACTOR = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
} as const;

beforeEach(() => {
  vi.unstubAllEnvs();
  vi.stubEnv("LINK_TOKEN_KEY", "d".repeat(64));
  vi.stubEnv("AI_PROVIDER_KEY", "a".repeat(64));
});

function deps(ai?: { aiProviders?: AiProviderRepository; aiModels?: AiProviderModelRepository }) {
  const links: ChatLinkRepository = {
    findById: async () => null,
    findByTokenHash: async () => null,
    list: async () => [],
    create: vi.fn(async (organizationId, input) => ({
      id: "link-1",
      organizationId,
      label: input.label,
      type: input.type,
      prospectId: input.prospectId,
      createdBy: input.createdBy,
      actif: true,
      expiresAt: input.expiresAt,
      templateKey: input.templateKey,
      templateVersion: input.templateVersion,
      sources: input.sources,
      confidentialiteId: input.confidentialiteId,
      userStateEnabled: input.userStateEnabled,
      visualTemplateId: input.visualTemplateId,
      visualTemplateVersion: input.visualTemplateVersion,
      visualTemplateConfig: input.visualTemplateConfig,
      visualTemplateParams: input.visualTemplateParams,
      aiProviderId: input.aiProviderId ?? null,
      aiModel: input.aiModel ?? null,
      visitCount: 0,
      lastVisitAt: null,
      createdAt: new Date(0).toISOString(),
    })),
    recordVisit: async () => undefined,
    getTokenEnc: async () => null,
    setLinkToken: async () => null,
    updateDetails: async () => null,
    delete: async () => false,
  };
  const prospects: ProspectRepository = {
    findById: async () => null,
    findByEmail: async () => null,
    list: async () => [],
    listLinkLabels: async () => [],
    create: async () => {
      throw new Error("non utilisé");
    },
    update: async () => null,
    delete: async () => false,
  };
  const templates: ChatTemplateRepository = {
    findByKey: async () => null,
    findVersion: async () => null,
    currentVersion: async (_organizationId, key) =>
      key === "inconnu"
        ? null
        : {
            id: "v1",
            templateId: "t1",
            version: 3,
            definition: {
              key,
              label: key,
              description: "",
              systemPrompt: "x",
              fields: [],
              renderTemplate: "x",
            },
            createdBy: null,
            createdAt: new Date(0).toISOString(),
          },
    createTemplate: async () => {
      throw new Error("non utilisé");
    },
    addVersion: async () => {
      throw new Error("non utilisé");
    },
    deleteTemplate: async () => false,
    list: async () => [],
    listKeysReferencedByLinks: async () => [],
    listKeysReferencedByFiches: async () => [],
  };
  const confidentialites = {
    listActives: async () => [
      {
        id: "conf-1",
        organizationId: "org-1",
        titre: "Politique",
        texte: "t",
        lien: "/confidentialite",
        actif: true,
        createdBy: null,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      },
    ],
    findById: async () => null,
    findByTitre: async () => null,
    list: async () => [],
    listLinkLabels: async () => [],
    create: async () => {
      throw new Error("non utilisé");
    },
    update: async () => null,
    delete: async () => false,
  };
  const visualTemplates: VisualTemplateRepository = {
    list: async () => [],
    listForOrganization: async () => [],
    findAssignedById: async () => null,
    listAllIds: async () => [],
    assignAllToOrganization: async () => undefined,
    assignToAllOrganizations: async () => undefined,
    unassign: async () => undefined,
    findById: async () => null,
    findByKey: async () => null,
    listVersions: async () => [],
    findVersion: async () => null,
    findAsset: async () => null,
    createTemplate: async () => {
      throw new Error("non utilisé");
    },
    createVersion: async () => {
      throw new Error("non utilisé");
    },
    addAsset: async () => {
      throw new Error("non utilisé");
    },
    deleteTemplate: async () => false,
  };
  return {
    links,
    prospects,
    templates,
    confidentialites,
    visualTemplates,
    ...(ai?.aiProviders === undefined ? {} : { aiProviders: ai.aiProviders }),
    ...(ai?.aiModels === undefined ? {} : { aiModels: ai.aiModels }),
  };
}

describe("createChatLink — expiration", () => {
  it("interprète une date seule comme fin du jour choisi (UTC)", async () => {
    const { link } = await createChatLink(deps(), ACTOR, {
      type: "standard",
      expiresAt: "2030-05-10",
    });
    expect(link.expiresAt).toBe("2030-05-11T00:00:00.000Z");
  });

  it("refuse une date passée", async () => {
    await expect(
      createChatLink(deps(), ACTOR, { type: "standard", expiresAt: "2020-01-01" }),
    ).rejects.toThrow(/futur/);
  });

  it("refuse une date invalide", async () => {
    await expect(
      createChatLink(deps(), ACTOR, { type: "standard", expiresAt: "pas-une-date" }),
    ).rejects.toThrow(/invalide/);
  });

  it("crée sans expiration quand le champ est vide", async () => {
    const { link, token } = await createChatLink(deps(), ACTOR, { type: "standard" });
    expect(link.expiresAt).toBeNull();
    expect(token).toHaveLength(32);
  });

  it("fige le modèle par défaut (fiche-projet, version courante)", async () => {
    const { link } = await createChatLink(deps(), ACTOR, { type: "standard" });
    expect(link.templateKey).toBe("fiche-projet");
    expect(link.templateVersion).toBe(3);
  });

  it("refuse un modèle inconnu", async () => {
    await expect(
      createChatLink(deps(), ACTOR, { type: "standard", templateKey: "inconnu" }),
    ).rejects.toThrow(/Modèle inconnu/);
  });
});

describe("createChatLink — affectation IA (ADR-0029)", () => {
  async function assignmentDeps(organizationId = "org-1") {
    const providers = memoryAiProviderRepository();
    const models = memoryAiModelRepository();
    const sealed = sealAiKey("sk-test-1234");
    const provider = await providers.repo.create(organizationId, {
      label: "OpenAI",
      preset: "openai",
      dialect: "openai",
      baseUrl: "https://api.openai.com/v1",
      sealedKey: sealed,
      apiKeyHint: sealed.hint,
      defaultModel: "gpt-4o-mini",
      createdBy: null,
    });
    await models.repo.create(organizationId, provider.id, {
      modelId: "gpt-4o-mini",
      source: "manual",
      createdBy: null,
    });
    return { provider, deps: deps({ aiProviders: providers.repo, aiModels: models.repo }) };
  }

  it("accepte un couple fournisseur + modèle de la même organisation", async () => {
    const { provider, deps: d } = await assignmentDeps();
    const { link } = await createChatLink(d, ACTOR, {
      type: "standard",
      aiProviderId: provider.id,
      aiModel: "gpt-4o-mini",
    });
    expect(link.aiProviderId).toBe(provider.id);
    expect(link.aiModel).toBe("gpt-4o-mini");
  });

  it("accepte l'héritage quand l'affectation est absente", async () => {
    const { link } = await createChatLink(deps(), ACTOR, { type: "standard" });
    expect(link.aiProviderId).toBeNull();
    expect(link.aiModel).toBeNull();
  });

  it("refuse une paire incomplète", async () => {
    const { provider, deps: d } = await assignmentDeps();
    await expect(
      createChatLink(d, ACTOR, { type: "standard", aiProviderId: provider.id }),
    ).rejects.toThrow(/ensemble/);
  });

  it("refuse un fournisseur d'une autre organisation", async () => {
    const { provider, deps: d } = await assignmentDeps("org-2");
    await expect(
      createChatLink(d, ACTOR, {
        type: "standard",
        aiProviderId: provider.id,
        aiModel: "gpt-4o-mini",
      }),
    ).rejects.toThrow(/introuvable/);
  });
});
