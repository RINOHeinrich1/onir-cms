import { type Actor, assertCan, organizationOf } from "@/application/actor";
import { BadGatewayError, ConflictError, NotFoundError } from "@/application/errors";
import type { AiModelCatalog } from "@/application/ports/ai-model-catalog";
import type { AiProviderRepository } from "@/application/ports/ai-provider-repository";
import { openAiKey } from "@/lib/ai-crypto";

export type AiProviderConnectivityDependencies = {
  providers: AiProviderRepository;
  catalog: AiModelCatalog;
};

async function targetFor(
  deps: AiProviderConnectivityDependencies,
  organizationId: string,
  id: string,
): Promise<{ baseUrl: string; apiKey: string; cacheKey: string }> {
  const provider = await deps.providers.findById(organizationId, id);
  if (provider === null) throw new NotFoundError("Fournisseur introuvable");
  if (provider.archivedAt !== null) throw new ConflictError("Fournisseur archivé");
  const sealed = await deps.providers.getSealedKey(organizationId, id);
  if (sealed === null) throw new NotFoundError("Clé fournisseur introuvable");
  let apiKey: string;
  try {
    apiKey = openAiKey(sealed);
  } catch {
    throw new BadGatewayError("Clé fournisseur illisible : vérifiez AI_PROVIDER_KEY");
  }
  return {
    baseUrl: provider.baseUrl,
    apiKey,
    cacheKey: `${provider.id}:${provider.updatedAt}`,
  };
}

export async function testAiProvider(
  deps: AiProviderConnectivityDependencies,
  actor: Actor,
  id: string,
): Promise<{
  ok: boolean;
  latencyMs: number;
  modelsCount: number;
  modelsAvailable: boolean;
  error: string;
}> {
  assertCan(actor, "ai:manage");
  const organizationId = organizationOf(actor);
  const target = await targetFor(deps, organizationId, id);
  const result = await deps.catalog.testConnection(target);
  await deps.providers.setLastTest(organizationId, id, {
    ok: result.ok,
    latencyMs: result.latencyMs,
    modelsCount: result.modelsCount,
    error: result.error,
  });
  return result;
}

export async function listAiProviderModels(
  deps: AiProviderConnectivityDependencies,
  actor: Actor,
  id: string,
): Promise<{ models: string[]; modelsAvailable: boolean }> {
  assertCan(actor, "ai:read");
  const target = await targetFor(deps, organizationOf(actor), id);
  const result = await deps.catalog.listModels(target);
  return { models: result.models, modelsAvailable: result.modelsAvailable };
}
