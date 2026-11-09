import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import type { ConnaissanceRepository } from "@/application/ports/connaissance-repository";
import type { MediaRepository } from "@/application/ports/media-repository";
import type { ChatbotConfig } from "@/domain/entities/chatbot-config";
import type { Connaissance } from "@/domain/entities/connaissance";
import type { Media, TypeMedia } from "@/domain/entities/media";
import type { RuntimeCache } from "@/infrastructure/cache/runtime-cache";
import { runtimeCacheConfig } from "@/lib/env";

function selectionKey(ids: readonly string[]): string {
  return [...ids].sort().join(",");
}

export function cachedChatbotConfigRepository(
  base: ChatbotConfigRepository,
  cache: RuntimeCache,
): ChatbotConfigRepository {
  const config = runtimeCacheConfig();
  const configKey = (organizationId: string, id: string): string =>
    cache.key("config", organizationId, id);
  const linkPrefix = (organizationId: string, chatLinkId: string): string =>
    cache.prefixFor("link-config", organizationId, chatLinkId);
  const linkKey = (organizationId: string, chatLinkId: string): string =>
    cache.key("link-config", organizationId, chatLinkId);

  return {
    ...base,
    async findById(organizationId, id): Promise<ChatbotConfig | null> {
      const cached = await cache.getJson<ChatbotConfig>(configKey(organizationId, id));
      if (cached !== null) return cached;
      const value = await base.findById(organizationId, id);
      if (value !== null) {
        await cache.setJson(configKey(organizationId, id), value, config.configTtlMs);
      }
      return value;
    },
    async currentForLink(organizationId, chatLinkId): Promise<ChatbotConfig | null> {
      const cached = await cache.getJson<ChatbotConfig>(linkKey(organizationId, chatLinkId));
      if (cached !== null) return cached;
      const value = await base.currentForLink(organizationId, chatLinkId);
      if (value !== null) {
        await cache.setJson(linkKey(organizationId, chatLinkId), value, config.linkConfigTtlMs);
      }
      return value;
    },
    async createVersion(organizationId, chatLinkId, input, createdBy) {
      const value = await base.createVersion(organizationId, chatLinkId, input, createdBy);
      await cache.invalidatePrefix(linkPrefix(organizationId, chatLinkId));
      return value;
    },
  };
}

export function cachedConnaissanceRepository(
  base: ConnaissanceRepository,
  cache: RuntimeCache,
): ConnaissanceRepository {
  const config = runtimeCacheConfig();
  const knowledgeKey = (organizationId: string, chatLinkId: string, selection: string): string =>
    cache.key("knowledge", organizationId, chatLinkId, selection);
  const orgPrefix = (organizationId: string): string =>
    cache.prefixFor("knowledge", organizationId);

  const listAll = base.listActivesForChatLink;
  const listSelected = base.listActivesForChatLinkSelection;

  return {
    ...base,
    ...(listAll === undefined
      ? {}
      : {
          async listActivesForChatLink(
            organizationId: string,
            chatLinkId: string,
          ): Promise<Connaissance[]> {
            const key = knowledgeKey(organizationId, chatLinkId, "all");
            const cached = await cache.getJson<Connaissance[]>(key);
            if (cached !== null) return cached;
            const value = await listAll.call(base, organizationId, chatLinkId);
            await cache.setJson(key, value, config.knowledgeTtlMs);
            return value;
          },
        }),
    ...(listSelected === undefined
      ? {}
      : {
          async listActivesForChatLinkSelection(
            organizationId: string,
            chatLinkId: string,
            globalIds: string[],
          ): Promise<Connaissance[]> {
            const key = knowledgeKey(
              organizationId,
              chatLinkId,
              `selected:${selectionKey(globalIds)}`,
            );
            const cached = await cache.getJson<Connaissance[]>(key);
            if (cached !== null) return cached;
            const value = await listSelected.call(base, organizationId, chatLinkId, globalIds);
            await cache.setJson(key, value, config.knowledgeTtlMs);
            return value;
          },
        }),
    async create(organizationId, input) {
      const value = await base.create(organizationId, input);
      await cache.invalidatePrefix(orgPrefix(organizationId));
      return value;
    },
    async update(organizationId, id, patch) {
      const value = await base.update(organizationId, id, patch);
      await cache.invalidatePrefix(orgPrefix(organizationId));
      return value;
    },
    async delete(organizationId, id) {
      const value = await base.delete(organizationId, id);
      await cache.invalidatePrefix(orgPrefix(organizationId));
      return value;
    },
    async deleteMany(organizationId, ids) {
      const value = await base.deleteMany(organizationId, ids);
      await cache.invalidatePrefix(orgPrefix(organizationId));
      return value;
    },
  };
}

export function cachedMediaRepository(base: MediaRepository, cache: RuntimeCache): MediaRepository {
  const config = runtimeCacheConfig();
  const mediaKey = (
    organizationId: string,
    type: TypeMedia,
    chatLinkId: string,
    selection: string,
  ): string => cache.key("media", organizationId, type, chatLinkId, selection);
  const orgPrefix = (organizationId: string): string => cache.prefixFor("media", organizationId);

  const listAll = base.listActivesByTypeForChatLink;
  const listSelected = base.listActivesByTypeForChatLinkSelection;

  return {
    ...base,
    ...(listAll === undefined
      ? {}
      : {
          async listActivesByTypeForChatLink(
            organizationId: string,
            type: TypeMedia,
            chatLinkId: string,
          ): Promise<Media[]> {
            const key = mediaKey(organizationId, type, chatLinkId, "all");
            const cached = await cache.getJson<Media[]>(key);
            if (cached !== null) return cached;
            const value = await listAll.call(base, organizationId, type, chatLinkId);
            await cache.setJson(key, value, config.mediaTtlMs);
            return value;
          },
        }),
    ...(listSelected === undefined
      ? {}
      : {
          async listActivesByTypeForChatLinkSelection(
            organizationId: string,
            type: TypeMedia,
            chatLinkId: string,
            globalIds: string[],
          ): Promise<Media[]> {
            const key = mediaKey(
              organizationId,
              type,
              chatLinkId,
              `selected:${selectionKey(globalIds)}`,
            );
            const cached = await cache.getJson<Media[]>(key);
            if (cached !== null) return cached;
            const value = await listSelected.call(
              base,
              organizationId,
              type,
              chatLinkId,
              globalIds,
            );
            await cache.setJson(key, value, config.mediaTtlMs);
            return value;
          },
        }),
    async create(organizationId, input) {
      const value = await base.create(organizationId, input);
      await cache.invalidatePrefix(orgPrefix(organizationId));
      return value;
    },
    async update(organizationId, id, patch) {
      const value = await base.update(organizationId, id, patch);
      await cache.invalidatePrefix(orgPrefix(organizationId));
      return value;
    },
    async delete(organizationId, id) {
      const value = await base.delete(organizationId, id);
      await cache.invalidatePrefix(orgPrefix(organizationId));
      return value;
    },
  };
}
