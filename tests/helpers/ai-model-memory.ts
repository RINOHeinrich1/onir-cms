import type { AiProviderModelRepository } from "@/application/ports/ai-model-repository";
import type { AiProviderModel } from "@/domain/entities/ai-model";

export function memoryAiModelRepository() {
  const models: AiProviderModel[] = [];
  const linksUsing = new Map<string, number>();
  let sequence = 0;

  const now = () => new Date().toISOString();

  const repo: AiProviderModelRepository = {
    async list(organizationId, providerId, options = {}) {
      return models.filter(
        (model) =>
          model.organizationId === organizationId &&
          model.providerId === providerId &&
          (options.enabledOnly !== true || model.enabled),
      );
    },
    async findById(organizationId, providerId, id) {
      return (
        models.find(
          (model) =>
            model.organizationId === organizationId &&
            model.providerId === providerId &&
            model.id === id,
        ) ?? null
      );
    },
    async findByModelId(organizationId, providerId, modelId) {
      return (
        models.find(
          (model) =>
            model.organizationId === organizationId &&
            model.providerId === providerId &&
            model.modelId === modelId,
        ) ?? null
      );
    },
    async create(organizationId, providerId, input) {
      if (
        models.some((model) => model.providerId === providerId && model.modelId === input.modelId)
      ) {
        throw Object.assign(new Error("duplicate"), { code: "23505" });
      }
      sequence += 1;
      const timestamp = now();
      const model: AiProviderModel = {
        id: `model-${sequence}`,
        organizationId,
        providerId,
        modelId: input.modelId,
        label: input.label ?? input.modelId,
        source: input.source,
        enabled: input.enabled ?? true,
        lastSeenAt: input.source === "catalog" ? timestamp : null,
        createdBy: input.createdBy,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      models.push(model);
      return model;
    },
    async syncCatalog(organizationId, providerId, modelIds) {
      for (const modelId of modelIds) {
        const existing = models.find(
          (model) => model.providerId === providerId && model.modelId === modelId,
        );
        if (existing !== undefined) {
          existing.lastSeenAt = now();
          existing.updatedAt = now();
        } else {
          await this.create(organizationId, providerId, {
            modelId,
            source: "catalog",
            createdBy: null,
          });
        }
      }
      return this.list(organizationId, providerId);
    },
    async setEnabled(organizationId, providerId, id, enabled) {
      const model = await this.findById(organizationId, providerId, id);
      if (model === null) return null;
      model.enabled = enabled;
      model.updatedAt = now();
      return model;
    },
    async remove(organizationId, providerId, id) {
      const index = models.findIndex(
        (model) =>
          model.organizationId === organizationId &&
          model.providerId === providerId &&
          model.id === id,
      );
      if (index < 0) return false;
      models.splice(index, 1);
      return true;
    },
    async countLinksUsing(_organizationId, _providerId, modelId) {
      return linksUsing.get(modelId) ?? 0;
    },
  };

  return {
    repo,
    models,
    setLinksUsing: (modelId: string, count: number) => linksUsing.set(modelId, count),
  };
}
