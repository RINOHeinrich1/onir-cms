import type { Pool } from "pg";
import { AiNotConfiguredError, AiProviderUnavailableError } from "@/application/errors";
import type { AiClient } from "@/application/ports/ai-client";
import type {
  AiClientFactory,
  AiTargetRef,
  ResolvedAiTarget,
} from "@/application/ports/ai-client-factory";
import type { AiProviderModelRepository } from "@/application/ports/ai-model-repository";
import type { AiProviderRepository } from "@/application/ports/ai-provider-repository";
import { infomaniakBaseUrl } from "@/domain/entities/ai-provider";
import { chatCompletionForProvider } from "@/infrastructure/ai/openai-client";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { openAiKey } from "@/lib/ai-crypto";
import { legacyAiCredentials } from "@/lib/env";

export type AiClientFactoryDependencies = {
  providers: AiProviderRepository;
  models: AiProviderModelRepository;
};

function unavailable(message: string): AiProviderUnavailableError {
  return new AiProviderUnavailableError(message);
}

async function resolveProviderTarget(
  deps: AiClientFactoryDependencies,
  organizationId: string,
  providerId: string,
  model: string,
  source: "link" | "organization",
): Promise<ResolvedAiTarget> {
  const provider = await deps.providers.findById(organizationId, providerId);
  if (provider === null || provider.archivedAt !== null) {
    throw unavailable(
      source === "link"
        ? "Fournisseur IA du lien indisponible (archivé ou supprimé) — réaffectez le lien"
        : "Fournisseur IA par défaut indisponible — corrigez la configuration",
    );
  }
  const modelRow = await deps.models.findByModelId(organizationId, providerId, model);
  if (modelRow === null || !modelRow.enabled) {
    throw unavailable(
      source === "link"
        ? "Modèle IA du lien indisponible (supprimé ou désactivé) — réaffectez le lien"
        : "Modèle IA par défaut indisponible — corrigez la configuration",
    );
  }
  return {
    organizationId,
    providerId,
    providerLabel: provider.label,
    model,
    source,
  };
}

/** Factory injectable (tests) : lien > défaut organisation > legacy env > erreur. */
export function createAiClientFactory(deps: AiClientFactoryDependencies): AiClientFactory {
  const resolve = async (target: AiTargetRef | null): Promise<ResolvedAiTarget> => {
    if (target !== null && target.aiProviderId !== null) {
      if (target.aiModel === null || target.aiModel.trim() === "") {
        throw unavailable("Modèle IA du lien manquant — réaffectez le lien");
      }
      return resolveProviderTarget(
        deps,
        target.organizationId,
        target.aiProviderId,
        target.aiModel,
        "link",
      );
    }
    if (target !== null && target.aiModel !== null) {
      throw unavailable("Affectation IA du lien incomplète — réaffectez le lien");
    }

    if (target !== null) {
      const settings = await deps.providers.getOrganizationSettings(target.organizationId);
      if (settings?.defaultProviderId !== null && settings?.defaultProviderId !== undefined) {
        if (settings.defaultModel === null || settings.defaultModel.trim() === "") {
          throw unavailable("Modèle IA par défaut manquant — corrigez la configuration");
        }
        return resolveProviderTarget(
          deps,
          target.organizationId,
          settings.defaultProviderId,
          settings.defaultModel,
          "organization",
        );
      }
    }

    const legacy = legacyAiCredentials();
    if (legacy !== null) {
      return {
        organizationId: target?.organizationId ?? "",
        providerId: null,
        providerLabel: "Infomaniak (legacy)",
        model: legacy.model,
        source: "legacy",
      };
    }
    throw new AiNotConfiguredError(
      "IA non configurée : définissez un fournisseur par défaut ou renseignez AI_API_TOKEN/AI_PRODUCT_ID",
    );
  };

  const buildClient = async (resolved: ResolvedAiTarget): Promise<AiClient> => {
    if (resolved.source === "legacy") {
      const legacy = legacyAiCredentials();
      if (legacy === null) throw new AiNotConfiguredError();
      return {
        async complete(input) {
          return chatCompletionForProvider({
            baseUrl: infomaniakBaseUrl(legacy.productId),
            apiKey: legacy.token,
            model: resolved.model,
            dialect: "infomaniak",
            label: resolved.providerLabel,
            messages: [{ role: "system", content: input.system }, ...input.messages],
            ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
          });
        },
      };
    }

    if (resolved.providerId === null) throw new AiNotConfiguredError();
    const provider = await deps.providers.findById(resolved.organizationId, resolved.providerId);
    if (provider === null || provider.archivedAt !== null) {
      throw unavailable("Fournisseur IA introuvable ou archivé — réaffectez le lien");
    }
    const sealed = await deps.providers.getSealedKey(provider.organizationId, provider.id);
    if (sealed === null) throw unavailable("Clé fournisseur IA introuvable");
    let apiKey: string;
    try {
      apiKey = openAiKey(sealed);
    } catch {
      throw unavailable("Clé fournisseur IA illisible : vérifiez AI_PROVIDER_KEY");
    }
    return {
      async complete(input) {
        return chatCompletionForProvider({
          baseUrl: provider.baseUrl,
          apiKey,
          model: resolved.model,
          dialect: provider.dialect,
          label: provider.label,
          messages: [{ role: "system", content: input.system }, ...input.messages],
          ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
        });
      },
    };
  };

  return {
    resolve,
    async forTarget(target) {
      return buildClient(await resolve(target));
    },
    async optionalTarget(target) {
      try {
        return await buildClient(await resolve(target));
      } catch (error) {
        if (error instanceof AiNotConfiguredError || error instanceof AiProviderUnavailableError) {
          return null;
        }
        throw error;
      }
    },
  };
}

/** Factory PostgreSQL liée à un pool. */
export function pgAiClientFactory(pool: Pool): AiClientFactory {
  return createAiClientFactory({
    providers: pgAiProviderRepository(pool),
    models: pgAiProviderModelRepository(pool),
  });
}
