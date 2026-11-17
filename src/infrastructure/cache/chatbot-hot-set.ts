import type { ChatbotHotSet as ChatbotHotSetPort } from "@/application/ports/chatbot-hot-set";
import { getRuntimeCache } from "@/infrastructure/cache/runtime-cache";
import { runtimeCacheConfig } from "@/lib/env";

export type HotSetStore = {
  key(...parts: string[]): string;
  prefixFor(...parts: string[]): string;
  touchHotMember(
    indexKey: string,
    member: string,
    score: number,
    limit: number,
  ): Promise<string | null>;
  setHotConfig(mapKey: string, member: string, configId: string): Promise<void>;
  getHotConfig(mapKey: string, member: string): Promise<string | null>;
  deleteHotConfig(mapKey: string, member: string): Promise<void>;
  deleteLocalKey(key: string): Promise<void>;
  invalidateLocalPrefix(prefix: string): Promise<void>;
};

function splitMember(member: string): { organizationId: string; chatLinkId: string } | null {
  const separator = member.indexOf(":");
  if (separator <= 0 || separator === member.length - 1) return null;
  return {
    organizationId: member.slice(0, separator),
    chatLinkId: member.slice(separator + 1),
  };
}

/**
 * Hot set LRU des chatbots (ADR-0094).
 *
 * L'index et la correspondance link → config sont dans le Valkey local du
 * nœud. Les données restent dans les clés de cache runtime existantes.
 */
export class ChatbotHotSet implements ChatbotHotSetPort {
  private readonly indexKey: string;
  private readonly configMapKey: string;

  constructor(
    private readonly store: HotSetStore,
    private readonly limit: number,
  ) {
    this.indexKey = store.key("hot", "links");
    this.configMapKey = store.key("hot", "config");
  }

  async touch(
    organizationId: string,
    chatLinkId: string,
    configId: string,
    score = Date.now(),
  ): Promise<void> {
    if (this.limit <= 0) return;
    const member = `${organizationId}:${chatLinkId}`;
    const evicted = await this.store.touchHotMember(this.indexKey, member, score, this.limit);
    if (evicted !== null && evicted !== member) await this.evict(evicted);
    if (evicted !== member) await this.store.setHotConfig(this.configMapKey, member, configId);
  }

  private async evict(member: string): Promise<void> {
    const configId = await this.store.getHotConfig(this.configMapKey, member);
    await this.store.deleteHotConfig(this.configMapKey, member);
    const target = splitMember(member);
    if (target === null) return;

    await this.store.invalidateLocalPrefix(
      this.store.prefixFor("link-config", target.organizationId, target.chatLinkId),
    );
    await this.store.invalidateLocalPrefix(
      this.store.prefixFor("knowledge", target.organizationId, target.chatLinkId),
    );
    await this.store.invalidateLocalPrefix(
      this.store.prefixFor("media", target.organizationId, target.chatLinkId),
    );
    if (configId !== null) {
      await this.store.deleteLocalKey(this.store.key("config", target.organizationId, configId));
    }
  }
}

let singleton: ChatbotHotSetPort | null | undefined;

/** Hot set partagé du processus ; null si le cache ou le hot set sont désactivés. */
export function getChatbotHotSet(): ChatbotHotSetPort | null {
  if (singleton !== undefined) return singleton;
  const cache = getRuntimeCache();
  const config = runtimeCacheConfig();
  if (cache === null || config.hotLinks <= 0) {
    singleton = null;
    return null;
  }
  singleton = new ChatbotHotSet(cache, config.hotLinks);
  return singleton;
}
