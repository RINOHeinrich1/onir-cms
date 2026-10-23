import type { Actor } from "@/application/actor";
import type { AiProviderRepository } from "@/application/ports/ai-provider-repository";
import type { AiProvider } from "@/domain/entities/ai-provider";
import type { OrganizationAiSettings } from "@/domain/entities/ai-settings";
import type { SealedAiKey } from "@/lib/ai-crypto";

export const testActor: Actor = {
  id: "user-1",
  role: "admin",
  organizationId: "org-1",
  isSuperAdmin: false,
};

export function memoryAiProviderRepository() {
  const providers: AiProvider[] = [];
  const keys = new Map<string, SealedAiKey>();
  const linksUsing = new Map<string, number>();
  let settings: OrganizationAiSettings | null = null;
  let sequence = 0;

  const repo: AiProviderRepository = {
    async list(organizationId, options = {}) {
      return providers.filter(
        (provider) =>
          provider.organizationId === organizationId &&
          (options.includeArchived === true || provider.archivedAt === null),
      );
    },
    async findById(organizationId, id) {
      return (
        providers.find(
          (provider) => provider.organizationId === organizationId && provider.id === id,
        ) ?? null
      );
    },
    async create(organizationId, input) {
      if (
        providers.some(
          (provider) =>
            provider.organizationId === organizationId &&
            provider.label.toLowerCase() === input.label.toLowerCase(),
        )
      ) {
        throw Object.assign(new Error("duplicate"), { code: "23505" });
      }
      sequence += 1;
      const now = new Date().toISOString();
      const provider: AiProvider = {
        id: `provider-${sequence}`,
        organizationId,
        label: input.label,
        preset: input.preset,
        dialect: input.dialect,
        baseUrl: input.baseUrl,
        apiKeyHint: input.apiKeyHint,
        defaultModel: input.defaultModel,
        archivedAt: null,
        lastTestAt: null,
        lastTestOk: null,
        lastTestError: "",
        createdBy: input.createdBy,
        createdAt: now,
        updatedAt: now,
      };
      providers.push(provider);
      keys.set(provider.id, input.sealedKey);
      return provider;
    },
    async update(organizationId, id, patch) {
      const index = providers.findIndex(
        (provider) => provider.organizationId === organizationId && provider.id === id,
      );
      const current = providers[index];
      if (current === undefined) return null;
      const updated: AiProvider = {
        ...current,
        ...(patch.label === undefined ? {} : { label: patch.label }),
        ...(patch.preset === undefined ? {} : { preset: patch.preset }),
        ...(patch.dialect === undefined ? {} : { dialect: patch.dialect }),
        ...(patch.baseUrl === undefined ? {} : { baseUrl: patch.baseUrl }),
        ...(patch.apiKeyHint === undefined ? {} : { apiKeyHint: patch.apiKeyHint }),
        ...(patch.defaultModel === undefined ? {} : { defaultModel: patch.defaultModel }),
        updatedAt: new Date().toISOString(),
      };
      providers[index] = updated;
      if (patch.sealedKey !== undefined) keys.set(id, patch.sealedKey);
      return updated;
    },
    async archive(organizationId, id) {
      return this.update(organizationId, id, {}).then((provider) => {
        if (provider === null) return null;
        const archived: AiProvider = {
          ...provider,
          archivedAt: new Date().toISOString(),
        };
        const index = providers.findIndex((entry) => entry.id === id);
        providers[index] = archived;
        return archived;
      });
    },
    async getSealedKey(_organizationId, id) {
      return keys.get(id) ?? null;
    },
    async setLastTest(organizationId, id, result) {
      const provider = await this.findById(organizationId, id);
      if (provider === null) return;
      const index = providers.findIndex((entry) => entry.id === id);
      providers[index] = {
        ...provider,
        lastTestAt: new Date().toISOString(),
        lastTestOk: result.ok,
        lastTestError: result.error,
      };
    },
    async countLinksUsing(_organizationId, id) {
      return linksUsing.get(id) ?? 0;
    },
    async getOrganizationSettings(organizationId) {
      return settings?.organizationId === organizationId ? settings : null;
    },
    async setOrganizationDefault(organizationId, input) {
      if (input.providerId === null || input.model === null) {
        settings = null;
        return null;
      }
      settings = {
        organizationId,
        defaultProviderId: input.providerId,
        defaultModel: input.model,
        updatedAt: new Date().toISOString(),
      };
      return settings;
    },
  };

  return {
    repo,
    providers,
    keys,
    linksUsing,
    setLinksUsing: (id: string, count: number) => linksUsing.set(id, count),
    setSettings: (value: OrganizationAiSettings | null) => {
      settings = value;
    },
  };
}
