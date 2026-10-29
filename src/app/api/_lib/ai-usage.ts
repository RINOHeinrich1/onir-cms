import type { AiUsageDependencies } from "@/application/use-cases/ai/manage-ai-usage";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { pgAiUsageRepository } from "@/infrastructure/db/ai-usage-repository";
import { pgChatLinkRepository } from "@/infrastructure/db/chat-link-repository";
import { getPool } from "@/infrastructure/db/pool";

export function aiUsageDeps(): AiUsageDependencies {
  const pool = getPool();
  return {
    usage: pgAiUsageRepository(pool),
    providers: pgAiProviderRepository(pool),
    models: pgAiProviderModelRepository(pool),
    links: pgChatLinkRepository(pool),
  };
}
