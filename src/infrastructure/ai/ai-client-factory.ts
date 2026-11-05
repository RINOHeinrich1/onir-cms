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
import type { AiUsageRecorder } from "@/application/ports/ai-usage-recorder";
import type { AiUsageRepository } from "@/application/ports/ai-usage-repository";
import { createOrganizationAiUsageRecorder } from "@/application/use-cases/ai/record-organization-ai-usage";
import { resolveUsageTargets } from "@/application/use-cases/ai/resolve-usage-targets";
import { aiCapabilitiesFor } from "@/domain/ai-capabilities";
import { infomaniakBaseUrl } from "@/domain/entities/ai-provider";
import {
  chatCompletionForProvider,
  chatCompletionWithToolsForProvider,
} from "@/infrastructure/ai/openai-client";
import { pgAiProviderModelRepository } from "@/infrastructure/db/ai-model-repository";
import { pgAiProviderRepository } from "@/infrastructure/db/ai-provider-repository";
import { pgAiUsageRepository } from "@/infrastructure/db/ai-usage-repository";
import { pgOrganizationAiQuotaRepository } from "@/infrastructure/db/organization-ai-quota-repository";
import { openAiKey } from "@/lib/ai-crypto";
import { legacyAiCredentials } from "@/lib/env";

export type AiClientFactoryDependencies = {
  providers: AiProviderRepository;
  models: AiProviderModelRepository;
  /** Défauts, clusters et overrides (ADR-0058). */
  usage?: AiUsageRepository;
  /** Comptage central et quotas organisation (ADR-0065). */
  usageRecorder?: AiUsageRecorder;
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
  clusterId: string | null,
): Promise<ResolvedAiTarget> {
  const provider =
    clusterId === null
      ? await deps.providers.findById(organizationId, providerId)
      : await deps.providers.findByIdForCluster(organizationId, clusterId, providerId);
  if (provider === null || provider.archivedAt !== null) {
    throw unavailable(
      source === "link"
        ? "Fournisseur IA du lien indisponible (archivé ou supprimé) — réaffectez le lien"
        : "Fournisseur IA par défaut indisponible — corrigez la configuration",
    );
  }
  const modelRow =
    clusterId === null
      ? await deps.models.findByModelId(organizationId, providerId, model)
      : await deps.models.findByModelIdForCluster(organizationId, clusterId, providerId, model);
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
    clusterId,
    source,
    preset: provider.preset,
    reasoningMode: modelRow.reasoningMode ?? "auto",
    capabilities: aiCapabilitiesFor(provider.preset, model, provider.reasoningProfile),
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
        target.aiClusterId ?? null,
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
          null,
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
        clusterId: null,
        source: "legacy",
        preset: "infomaniak",
        reasoningMode: "auto",
        capabilities: aiCapabilitiesFor("infomaniak", legacy.model),
      };
    }
    throw new AiNotConfiguredError(
      "IA non configurée : définissez un fournisseur par défaut ou renseignez AI_API_TOKEN/AI_PRODUCT_ID",
    );
  };

  const instrumentClient = (
    resolved: ResolvedAiTarget,
    operation: string | undefined,
    client: AiClient,
  ): AiClient => {
    const recorder = deps.usageRecorder;
    if (recorder === undefined || resolved.organizationId === "") return client;
    const context = {
      organizationId: resolved.organizationId,
      providerId: resolved.providerId,
      providerLabel: resolved.providerLabel,
      model: resolved.model,
      clusterId: resolved.clusterId ?? null,
    };
    const forwardedUsage =
      (input: import("@/application/ports/ai-client").AiCompletionInput) =>
      async (usage: import("@/application/ports/ai-client").AiTokenUsage) => {
        try {
          await recorder.record({
            ...context,
            usage: input.usageOperation ?? operation ?? "other",
            ...usage,
          });
        } catch (error) {
          console.error("[ia] usage organisation non enregistré", error);
        }
        await input.onUsage?.(usage);
      };

    const wrapped: AiClient = {
      capabilities: client.capabilities ?? resolved.capabilities,
      async complete(input) {
        await recorder.assertCanCall(context);
        return client.complete({ ...input, onUsage: forwardedUsage(input) });
      },
    };
    if (client.completeWithTools !== undefined) {
      wrapped.completeWithTools = async (input) => {
        await recorder.assertCanCall(context);
        return (
          client.completeWithTools?.({ ...input, onUsage: forwardedUsage(input) }) ?? {
            content: "",
            toolCalls: [],
            finishReason: null,
          }
        );
      };
    }
    return wrapped;
  };

  const buildClient = async (resolved: ResolvedAiTarget, operation?: string): Promise<AiClient> => {
    if (resolved.source === "legacy") {
      const legacy = legacyAiCredentials();
      if (legacy === null) throw new AiNotConfiguredError();
      return instrumentClient(resolved, operation, {
        capabilities: resolved.capabilities,
        async complete(input) {
          return chatCompletionForProvider({
            baseUrl: infomaniakBaseUrl(legacy.productId),
            apiKey: legacy.token,
            model: resolved.model,
            dialect: "infomaniak",
            label: resolved.providerLabel,
            messages: [{ role: "system", content: input.system }, ...input.messages],
            ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
            reasoning: input.reasoning ?? resolved.reasoningMode,
            structured: input.structured === true,
            capabilities: resolved.capabilities,
            onUsage: input.onUsage,
            onFinishReason: input.onFinishReason,
          });
        },
        async completeWithTools(input) {
          return chatCompletionWithToolsForProvider({
            baseUrl: infomaniakBaseUrl(legacy.productId),
            apiKey: legacy.token,
            model: resolved.model,
            dialect: "infomaniak",
            label: resolved.providerLabel,
            messages: [{ role: "system", content: input.system }, ...input.messages],
            ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
            reasoning: input.reasoning ?? resolved.reasoningMode,
            structured: input.structured === true,
            ...(input.tools === undefined ? {} : { tools: input.tools }),
            ...(input.toolChoice === undefined ? {} : { toolChoice: input.toolChoice }),
            capabilities: resolved.capabilities,
            onUsage: input.onUsage,
            onFinishReason: input.onFinishReason,
          });
        },
      });
    }

    if (resolved.providerId === null) throw new AiNotConfiguredError();
    const provider =
      resolved.clusterId === null || resolved.clusterId === undefined
        ? await deps.providers.findById(resolved.organizationId, resolved.providerId)
        : await deps.providers.findByIdForCluster(
            resolved.organizationId,
            resolved.clusterId,
            resolved.providerId,
          );
    if (provider === null || provider.archivedAt !== null) {
      throw unavailable("Fournisseur IA introuvable ou archivé — réaffectez le lien");
    }
    const sealed = await deps.providers.getSealedKey(provider.organizationId, provider.id);
    if (sealed === null) throw unavailable("Clé fournisseur IA introuvable");
    let apiKey: string;
    try {
      apiKey = openAiKey(sealed);
    } catch {
      throw unavailable(
        "Clé fournisseur IA illisible : vérifiez Configuration → Secrets applicatifs",
      );
    }
    return instrumentClient(resolved, operation, {
      capabilities: resolved.capabilities,
      async complete(input) {
        return chatCompletionForProvider({
          baseUrl: provider.baseUrl,
          apiKey,
          model: resolved.model,
          dialect: provider.dialect,
          label: provider.label,
          messages: [{ role: "system", content: input.system }, ...input.messages],
          ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
          reasoning: input.reasoning ?? resolved.reasoningMode,
          structured: input.structured === true,
          capabilities: resolved.capabilities,
          onUsage: input.onUsage,
          onFinishReason: input.onFinishReason,
        });
      },
      async completeWithTools(input) {
        return chatCompletionWithToolsForProvider({
          baseUrl: provider.baseUrl,
          apiKey,
          model: resolved.model,
          dialect: provider.dialect,
          label: provider.label,
          messages: [{ role: "system", content: input.system }, ...input.messages],
          ...(input.maxTokens === undefined ? {} : { maxTokens: input.maxTokens }),
          reasoning: input.reasoning ?? resolved.reasoningMode,
          structured: input.structured === true,
          ...(input.tools === undefined ? {} : { tools: input.tools }),
          ...(input.toolChoice === undefined ? {} : { toolChoice: input.toolChoice }),
          capabilities: resolved.capabilities,
          onUsage: input.onUsage,
          onFinishReason: input.onFinishReason,
        });
      },
    });
  };

  const forUsage = async (
    target: AiTargetRef | null,
    usage: import("@/domain/entities/ai-usage").AiUsage,
    chatLinkId?: string | null,
  ) => {
    if (deps.usage === undefined) {
      return [{ label: "lien", client: await buildClient(await resolve(target), usage) }];
    }
    const refs = await resolveUsageTargets(
      { usage: deps.usage },
      {
        organizationId: target?.organizationId ?? "",
        usage,
        chatLinkId: chatLinkId ?? null,
        fallbackTarget: target,
      },
    );
    if (refs.length === 0) {
      if (usage === "assistant") throw new AiNotConfiguredError();
      return [{ label: "legacy", client: await buildClient(await resolve(target), usage) }];
    }
    const clients: { label: string; client: AiClient }[] = [];
    const seen = new Set<string>();
    let lastError: unknown = null;
    for (const [index, ref] of refs.entries()) {
      try {
        const resolved = await resolve(ref);
        const key = `${resolved.providerId ?? "legacy"}:${resolved.model}`;
        if (seen.has(key)) continue;
        seen.add(key);
        clients.push({
          label: `${usage}${refs.length > 1 ? ` #${index + 1}` : ""} · ${resolved.providerLabel} · ${resolved.model}`,
          client: await buildClient(resolved, usage),
        });
      } catch (error) {
        lastError = error;
      }
    }
    if (clients.length === 0) {
      throw lastError instanceof Error ? lastError : new AiNotConfiguredError();
    }
    return clients;
  };

  return {
    resolve,
    async resolveForUsage(target, usage) {
      if (deps.usage === undefined) return resolve(target);
      const refs = await resolveUsageTargets(
        { usage: deps.usage },
        {
          organizationId: target?.organizationId ?? "",
          usage,
          fallbackTarget: target,
        },
      );
      const first = refs[0];
      return first === undefined ? resolve(target) : resolve(first);
    },
    async forTarget(target, operation) {
      return buildClient(await resolve(target), operation);
    },
    async forUsage(target, usage, chatLinkId) {
      return forUsage(target, usage, chatLinkId);
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
    async forExtraction(target, chatLinkId) {
      if (deps.usage !== undefined) {
        return forUsage(target, "extraction", chatLinkId ?? null);
      }
      const settings =
        target === null
          ? null
          : await deps.providers.getOrganizationSettings(target.organizationId);
      const candidates: { target: AiTargetRef | null; label: string }[] = [];
      if (settings?.extractionProviderId != null && settings.extractionModel != null) {
        candidates.push({
          target: {
            organizationId: settings.organizationId,
            aiProviderId: settings.extractionProviderId,
            aiModel: settings.extractionModel,
          },
          label: "extraction",
        });
      }
      if (
        settings?.extractionFallbackProviderId != null &&
        settings.extractionFallbackModel != null
      ) {
        candidates.push({
          target: {
            organizationId: settings.organizationId,
            aiProviderId: settings.extractionFallbackProviderId,
            aiModel: settings.extractionFallbackModel,
          },
          label: "secours",
        });
      }
      candidates.push({ target, label: "lien" });

      const clients: { label: string; client: AiClient }[] = [];
      const seen = new Set<string>();
      let lastError: unknown = null;
      for (const candidate of candidates) {
        try {
          const resolved = await resolve(candidate.target);
          const key = `${resolved.providerId ?? "legacy"}:${resolved.model}`;
          if (seen.has(key)) continue;
          seen.add(key);
          clients.push({
            label: `${candidate.label} · ${resolved.providerLabel} · ${resolved.model}`,
            client: await buildClient(resolved, "extraction"),
          });
        } catch (error) {
          lastError = error;
        }
      }
      if (clients.length === 0) {
        throw lastError instanceof Error ? lastError : new AiNotConfiguredError();
      }
      return clients;
    },
  };
}

/** Factory PostgreSQL liée à un pool. */
export function pgAiClientFactory(pool: Pool): AiClientFactory {
  const quotas = pgOrganizationAiQuotaRepository(pool);
  return createAiClientFactory({
    providers: pgAiProviderRepository(pool),
    models: pgAiProviderModelRepository(pool),
    usage: pgAiUsageRepository(pool),
    usageRecorder: createOrganizationAiUsageRecorder({ quotas }),
  });
}
