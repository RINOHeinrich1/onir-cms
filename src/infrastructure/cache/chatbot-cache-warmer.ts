import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import type { ChatbotHotSet } from "@/application/ports/chatbot-hot-set";
import { getChatbotHotSet } from "@/infrastructure/cache/chatbot-hot-set";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { pgChatbotConfigRepository } from "@/infrastructure/db/chatbot-config-repository";
import { getPool } from "@/infrastructure/db/pool";
import { runtimeCacheConfig } from "@/lib/env";

export type ChatbotCacheWarmerDependencies = {
  links: Pick<ChatLinkRepository, "listRecentlyActive">;
  configs: Pick<ChatbotConfigRepository, "findById">;
  hotSet: ChatbotHotSet;
  limit: number;
};

/** Précharge les configurations des chatbots les plus récemment actifs. */
export async function warmChatbotCache(deps: ChatbotCacheWarmerDependencies): Promise<number> {
  if (deps.limit <= 0 || deps.links.listRecentlyActive === undefined) return 0;
  const links = await deps.links.listRecentlyActive(deps.limit);
  const now = Date.now();
  let warmed = 0;
  for (const [index, link] of links.entries()) {
    if (link.currentConfigId === null) continue;
    const config = await deps.configs.findById(link.organizationId, link.currentConfigId);
    if (config === null) continue;
    // La liste est triée du plus récent au plus ancien : le score le plus haut
    // doit rester au premier.
    await deps.hotSet.touch(link.organizationId, link.id, config.id, now - index);
    warmed += 1;
  }
  return warmed;
}

let started = false;

async function tick(): Promise<void> {
  try {
    const config = runtimeCacheConfig();
    const hotSet = getChatbotHotSet();
    if (hotSet === null || config.hotLinks <= 0) return;
    const pool = getPool();
    await warmChatbotCache({
      links: pgChatLinkRepository(pool),
      configs: pgChatbotConfigRepository(pool),
      hotSet,
      limit: config.hotLinks,
    });
  } catch (error) {
    process.stderr.write(`[cache] warm-up chatbots : ${String(error)}\n`);
  }
}

/** Démarre le warm-up in-process (idempotent, non bloquant). */
export function startChatbotCacheWarmer(): void {
  if (started) return;
  const config = runtimeCacheConfig();
  if (config.hotLinks <= 0 || getChatbotHotSet() === null) return;
  started = true;
  const timer = setInterval(() => {
    void tick();
  }, config.warmIntervalMs);
  timer.unref();
  void tick();
}

/** Exécute un warm-up unique (tests / diagnostic). */
export async function runChatbotCacheWarmOnce(): Promise<void> {
  await tick();
}
