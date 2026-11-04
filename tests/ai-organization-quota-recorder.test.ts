import { describe, expect, it, vi } from "vitest";
import { AiQuotaExceededError } from "@/application/errors";
import type { OrganizationAiQuotaRepository } from "@/application/ports/organization-ai-quota-repository";
import { createOrganizationAiUsageRecorder } from "@/application/use-cases/ai/record-organization-ai-usage";
import type {
  OrganizationAiAllocation,
  OrganizationAiBudget,
  OrganizationAiQuotaState,
} from "@/domain/entities/organization-ai-quota";

function budget(overrides: Partial<OrganizationAiBudget> = {}): OrganizationAiBudget {
  return {
    organizationId: "org-1",
    maxTokens: 100,
    tokensUsed: 0,
    tokenResetMode: "manual",
    tokenResetDays: null,
    tokenPeriodStartedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function allocation(
  target: OrganizationAiAllocation["target"],
  overrides: Partial<OrganizationAiAllocation> = {},
): OrganizationAiAllocation {
  return {
    id: "allocation-1",
    organizationId: "org-1",
    target,
    maxTokens: 50,
    tokensUsed: 0,
    ...overrides,
  };
}

function recorderWith(state: OrganizationAiQuotaState) {
  const recordUsage = vi.fn(async () => undefined);
  const quotas = {
    readState: vi.fn(async () => state),
    recordUsage,
  } as unknown as Pick<OrganizationAiQuotaRepository, "readState" | "recordUsage">;
  return { recorder: createOrganizationAiUsageRecorder({ quotas }), recordUsage };
}

const context = {
  organizationId: "org-1",
  providerId: "provider-1",
  providerLabel: "Infomaniak",
  model: "qwen",
  clusterId: null,
};

describe("comptage central des quotas organisation", () => {
  it("bloque quand le budget global est épuisé", async () => {
    const { recorder } = recorderWith({
      budget: budget({ tokensUsed: 100 }),
      allocations: [],
    });
    await expect(recorder.assertCanCall(context)).rejects.toBeInstanceOf(AiQuotaExceededError);
  });

  it("bloque quand le quota du modèle est épuisé", async () => {
    const { recorder } = recorderWith({
      budget: budget(),
      allocations: [
        allocation({ kind: "model", providerId: "provider-1", model: "qwen" }, { tokensUsed: 50 }),
      ],
    });
    await expect(recorder.assertCanCall(context)).rejects.toBeInstanceOf(AiQuotaExceededError);
  });

  it("bloque quand le quota du cluster est épuisé", async () => {
    const { recorder } = recorderWith({
      budget: budget(),
      allocations: [allocation({ kind: "cluster", clusterId: "cluster-1" }, { tokensUsed: 50 })],
    });
    await expect(
      recorder.assertCanCall({ ...context, clusterId: "cluster-1" }),
    ).rejects.toBeInstanceOf(AiQuotaExceededError);
  });

  it("laisse passer un appel direct si seul un autre cluster est épuisé", async () => {
    const { recorder } = recorderWith({
      budget: budget(),
      allocations: [allocation({ kind: "cluster", clusterId: "cluster-1" }, { tokensUsed: 50 })],
    });
    await expect(recorder.assertCanCall(context)).resolves.toBeUndefined();
  });

  it("normalise l'usage avant de l'enregistrer", async () => {
    const { recorder, recordUsage } = recorderWith({ budget: budget(), allocations: [] });
    await recorder.record({
      organizationId: "org-1",
      providerId: null,
      providerLabel: "legacy",
      model: "qwen",
      clusterId: null,
      usage: "chat_reply",
      promptTokens: 10.9,
      completionTokens: -2,
      totalTokens: 12.2,
    });
    expect(recordUsage).toHaveBeenCalledWith(
      expect.objectContaining({ promptTokens: 10, completionTokens: 0, totalTokens: 12 }),
    );
  });
});
