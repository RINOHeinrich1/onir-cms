import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/application/actor";
import { ForbiddenError, ValidationError } from "@/application/errors";
import type { OrganizationLimits } from "@/application/ports/organization-ai-quota-repository";
import {
  resetOrganizationAiTokens,
  saveOrganizationAiLimits,
} from "@/application/use-cases/organizations/manage-organization-ai-limits";

const superAdmin: Actor = {
  id: "user-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: true,
};
const orgAdmin: Actor = { ...superAdmin, isSuperAdmin: false };

const existing: OrganizationLimits = {
  organizationId: "org-1",
  maxChatbots: 2,
  limitProfileId: null,
  chatbotsCount: 1,
  budget: {
    organizationId: "org-1",
    maxTokens: 1000,
    tokensUsed: 200,
    tokenResetMode: "manual",
    tokenResetDays: null,
    tokenPeriodStartedAt: new Date(0).toISOString(),
  },
  allocations: [
    {
      id: "allocation-1",
      organizationId: "org-1",
      target: { kind: "model", providerId: "provider-1", model: "model-1" },
      maxTokens: 500,
      tokensUsed: 100,
    },
  ],
};

function deps() {
  const saveLimits = vi.fn(async (_org: string, input: OrganizationLimits) => ({
    ...existing,
    ...input,
  }));
  const resetBudget = vi.fn(async () => true);
  return {
    quotas: {
      getLimits: vi.fn(async () => existing),
      saveLimits,
      resetBudget,
    },
    providers: {
      findById: vi.fn(async () => ({ id: "provider-1" })),
    },
    models: {
      findByModelId: vi.fn(async () => ({ modelId: "model-1", enabled: true })),
    },
    usage: {
      listClusters: vi.fn(async () => []),
    },
    saveLimits,
    resetBudget,
  };
}

describe("limites IA d'organisation", () => {
  it("refuse un admin d'organisation", async () => {
    await expect(
      saveOrganizationAiLimits(deps() as never, orgAdmin, "org-1", { maxChatbots: 3 }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("préserve les allocations et compteurs quand les champs sont absents", async () => {
    const d = deps();
    const result = await saveOrganizationAiLimits(d as never, superAdmin, "org-1", {
      maxChatbots: 3,
    });
    expect(d.saveLimits).toHaveBeenCalledWith("org-1", {
      maxChatbots: 3,
      maxTokens: 1000,
      tokenResetMode: "manual",
      tokenResetDays: null,
      allocations: [
        {
          target: { kind: "model", providerId: "provider-1", model: "model-1" },
          maxTokens: 500,
        },
      ],
    });
    expect(result.maxChatbots).toBe(3);
  });

  it("refuse une allocation en double", async () => {
    const d = deps();
    await expect(
      saveOrganizationAiLimits(d as never, superAdmin, "org-1", {
        allocations: [
          { kind: "model", providerId: "provider-1", model: "model-1", maxTokens: 10 },
          { kind: "model", providerId: "provider-1", model: "model-1", maxTokens: 20 },
        ],
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("réinitialise uniquement via l'action dédiée", async () => {
    const d = deps();
    await resetOrganizationAiTokens(d as never, superAdmin, "org-1");
    expect(d.resetBudget).toHaveBeenCalledWith("org-1");
  });
});
