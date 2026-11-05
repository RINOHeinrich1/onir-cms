import { describe, expect, it } from "vitest";
import type { Actor } from "@/application/actor";
import type { AiProviderModelRepository } from "@/application/ports/ai-model-repository";
import type { AiProviderRepository } from "@/application/ports/ai-provider-repository";
import type { AiUsageRepository } from "@/application/ports/ai-usage-repository";
import { listChatbotAiModels } from "@/application/use-cases/chatbots/list-chatbot-ai-models";

const ACTOR: Actor = {
  id: "user-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
};

function deps(usage: Partial<AiUsageRepository> = {}) {
  return {
    providers: {
      list: async () => [],
      getOrganizationSettings: async () => null,
    } as unknown as AiProviderRepository,
    models: {
      list: async () => [],
    } as unknown as AiProviderModelRepository,
    usage: usage as AiUsageRepository,
  };
}

describe("modèles de l'assistance IA", () => {
  it("expose le cluster partagé quand aucun fournisseur direct n'est listé", async () => {
    const result = await listChatbotAiModels(
      deps({
        listDefaults: async () => [
          { usage: "assistant", target: { kind: "cluster", clusterId: "cluster-1" } },
        ],
        listClusters: async () => [
          {
            id: "cluster-1",
            organizationId: "org-owner",
            label: "onir-answer-cluster",
            description: "",
            actif: true,
            members: [{ position: 1, providerId: "provider-1", model: "model-1", enabled: true }],
            createdAt: new Date(0).toISOString(),
            updatedAt: new Date(0).toISOString(),
          },
        ],
      }),
      ACTOR,
    );

    expect(result.providers).toEqual([]);
    expect(result.sharedDefault).toEqual({
      id: "cluster-1",
      label: "onir-answer-cluster",
    });
  });

  it("ne signale pas de cluster partagé quand un fournisseur direct est disponible", async () => {
    const result = await listChatbotAiModels(
      {
        ...deps({
          listDefaults: async () => [
            { usage: "assistant", target: { kind: "cluster", clusterId: "cluster-1" } },
          ],
          listClusters: async () => [],
        }),
        providers: {
          list: async () => [
            {
              id: "provider-1",
              organizationId: "org-1",
              label: "Mon fournisseur",
              preset: "deepseek",
              dialect: "openai",
              baseUrl: "https://example.test",
              apiKeyHint: "",
              defaultModel: "model-1",
              reasoningProfile: "auto",
              archivedAt: null,
              lastTestAt: null,
              lastTestOk: null,
              lastTestError: "",
              createdBy: null,
              createdAt: new Date(0).toISOString(),
              updatedAt: new Date(0).toISOString(),
            },
          ],
          getOrganizationSettings: async () => null,
        } as unknown as AiProviderRepository,
        models: {
          list: async () => [
            {
              id: "model-row-1",
              organizationId: "org-1",
              providerId: "provider-1",
              modelId: "model-1",
              label: "Modèle 1",
              source: "manual",
              enabled: true,
              reasoningMode: "auto",
              lastSeenAt: null,
              createdBy: null,
              createdAt: new Date(0).toISOString(),
              updatedAt: new Date(0).toISOString(),
            },
          ],
        } as unknown as AiProviderModelRepository,
      },
      ACTOR,
    );

    expect(result.providers).toHaveLength(1);
    expect(result.sharedDefault).toBeNull();
  });
});
