import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { VisualTemplateRepository } from "@/application/ports/visual-template-repository";
import { parseExpiresAt } from "@/application/use-cases/links/link-fields";
import { updateChatLink } from "@/application/use-cases/links/manage-chat-links";
import type { ChatLink } from "@/domain/entities/chat";
import { sealAiKey } from "@/lib/ai-crypto";
import { memoryAiModelRepository } from "./helpers/ai-model-memory";
import { memoryAiProviderRepository } from "./helpers/ai-provider-memory";

beforeEach(() => {
  vi.stubEnv("AI_PROVIDER_KEY", "a".repeat(64));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const ACTOR = {
  id: "admin-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
} as const;

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

function linkRow(expiresAt: string | null): ChatLink {
  return {
    id: "link-1",
    organizationId: "org-1",
    label: "",
    type: "standard",
    identificationMode: "contact",
    prospectId: null,
    createdBy: "admin-1",
    actif: true,
    expiresAt,
    templateKey: "fiche-projet",
    templateVersion: 1,
    sources: { connaissances: true, phototheque: true, lien: true },
    confidentialiteId: null,
    userStateEnabled: false,
    visualTemplateId: null,
    visualTemplateVersion: null,
    visualTemplateConfig: {},
    visualTemplateParams: {},
    aiProviderId: null,
    aiModel: null,
    visitCount: 0,
    lastVisitAt: null,
    createdAt: new Date(0).toISOString(),
  };
}

describe("parseExpiresAt", () => {
  it("vide ou absent => sans expiration", () => {
    expect(parseExpiresAt("")).toBeNull();
    expect(parseExpiresAt(undefined)).toBeNull();
    expect(parseExpiresAt(null)).toBeNull();
  });

  it("date seule => fin du jour choisi (minuit UTC du lendemain)", () => {
    expect(parseExpiresAt("2030-05-10")).toBe("2030-05-11T00:00:00.000Z");
  });

  it("refuse le passé", () => {
    expect(() => parseExpiresAt("2020-01-01")).toThrow(/futur/);
  });

  it("refuse l'invalide", () => {
    expect(() => parseExpiresAt("pas-une-date")).toThrow(/invalide/);
  });
});

describe("updateChatLink", () => {
  function repo(current: ChatLink | null) {
    return {
      findById: async () => current,
      findByTokenHash: async () => null,
      list: async () => [],
      create: async () => linkRow(null),
      recordVisit: async () => undefined,
      getTokenEnc: async () => null,
      setLinkToken: async () => null,
      updateDetails: vi.fn(
        async (
          _organizationId: string,
          _id: string,
          patch: Parameters<ChatLinkRepository["updateDetails"]>[2],
        ) => (current === null ? null : { ...current, ...patch }),
      ),
      delete: async () => false,
    } satisfies ChatLinkRepository;
  }

  it("met à jour le libellé et l'expiration (fin de jour inclusive)", async () => {
    const links = repo(linkRow(null));
    const updated = await updateChatLink({ links, visualTemplates }, ACTOR, "link-1", {
      label: "  Salon IT  ",
      expiresAt: "2030-06-01",
    });
    expect(updated.label).toBe("Salon IT");
    expect(updated.expiresAt).toBe("2030-06-02T00:00:00.000Z");
  });

  it("retire l'expiration quand la date est vide et conserve le libellé", async () => {
    const links = repo({ ...linkRow("2030-06-02T00:00:00.000Z"), label: "Ancien" });
    const updated = await updateChatLink({ links, visualTemplates }, ACTOR, "link-1", {
      expiresAt: "",
    });
    expect(updated.expiresAt).toBeNull();
    expect(updated.label).toBe("Ancien");
  });

  it("échoue sur lien introuvable", async () => {
    const links = repo(null);
    await expect(
      updateChatLink({ links, visualTemplates }, ACTOR, "missing", { expiresAt: "2030-06-01" }),
    ).rejects.toThrow(/introuvable/);
  });

  it("échoue sans champ modifiable", async () => {
    const links = repo(linkRow(null));
    await expect(updateChatLink({ links, visualTemplates }, ACTOR, "link-1", {})).rejects.toThrow();
  });

  it("refuse un libellé trop long", async () => {
    const links = repo(linkRow(null));
    await expect(
      updateChatLink({ links, visualTemplates }, ACTOR, "link-1", { label: "x".repeat(121) }),
    ).rejects.toThrow(/120/);
  });

  it("bascule vers un fournisseur/modèle explicite", async () => {
    const providers = memoryAiProviderRepository();
    const models = memoryAiModelRepository();
    const sealed = sealAiKey("sk-test-1234");
    const provider = await providers.repo.create("org-1", {
      label: "OpenAI",
      preset: "openai",
      dialect: "openai",
      baseUrl: "https://api.openai.com/v1",
      sealedKey: sealed,
      apiKeyHint: sealed.hint,
      defaultModel: "gpt-4o-mini",
      createdBy: null,
    });
    await models.repo.create("org-1", provider.id, {
      modelId: "gpt-4o-mini",
      source: "manual",
      createdBy: null,
    });
    const links = repo(linkRow(null));
    const updated = await updateChatLink(
      {
        links,
        visualTemplates,
        aiProviders: providers.repo,
        aiModels: models.repo,
      },
      ACTOR,
      "link-1",
      { aiProviderId: provider.id, aiModel: "gpt-4o-mini" },
    );
    expect(updated.aiProviderId).toBe(provider.id);
    expect(updated.aiModel).toBe("gpt-4o-mini");
  });

  it("revient à l'héritage avec null/null", async () => {
    const links = repo({
      ...linkRow(null),
      aiProviderId: "provider-1",
      aiModel: "gpt-4o-mini",
    });
    const updated = await updateChatLink({ links, visualTemplates }, ACTOR, "link-1", {
      aiProviderId: null,
      aiModel: null,
    });
    expect(updated.aiProviderId).toBeNull();
    expect(updated.aiModel).toBeNull();
  });

  it("refuse une paire incomplète", async () => {
    const links = repo(linkRow(null));
    await expect(
      updateChatLink({ links, visualTemplates }, ACTOR, "link-1", { aiModel: "gpt-4o-mini" }),
    ).rejects.toThrow(/ensemble/);
  });

  it("refuse un fournisseur d'une autre organisation", async () => {
    const providers = memoryAiProviderRepository();
    const models = memoryAiModelRepository();
    const sealed = sealAiKey("sk-test-1234");
    const provider = await providers.repo.create("org-2", {
      label: "Autre",
      preset: "openai",
      dialect: "openai",
      baseUrl: "https://api.openai.com/v1",
      sealedKey: sealed,
      apiKeyHint: sealed.hint,
      defaultModel: null,
      createdBy: null,
    });
    await models.repo.create("org-2", provider.id, {
      modelId: "gpt-4o-mini",
      source: "manual",
      createdBy: null,
    });
    const links = repo(linkRow(null));
    await expect(
      updateChatLink(
        {
          links,
          visualTemplates,
          aiProviders: providers.repo,
          aiModels: models.repo,
        },
        ACTOR,
        "link-1",
        { aiProviderId: provider.id, aiModel: "gpt-4o-mini" },
      ),
    ).rejects.toThrow(/introuvable/);
  });
});
