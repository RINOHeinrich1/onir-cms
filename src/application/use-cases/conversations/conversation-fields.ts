import { type Actor, actorCan, assertCan, organizationOf } from "@/application/actor";
import { AppError, BadGatewayError, NotFoundError, UnprocessableError } from "@/application/errors";
import type { AiTokenUsage } from "@/application/ports/ai-client";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatOperatorScopeRepository } from "@/application/ports/chat-operator-scope-repository";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import type { ConversationFicheInstanceRepository } from "@/application/ports/conversation-fiche-instance-repository";
import type { ConversationFieldRepository } from "@/application/ports/conversation-field-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import { withAiUsage } from "@/application/use-cases/ai/with-ai-usage";
import { assertTokenBudgetAvailable } from "@/application/use-cases/chat/chat-link-quota";
import { ficheToDefinition } from "@/application/use-cases/chat/chatbot-config-runtime";
import { resolveConversationLinkScope } from "@/application/use-cases/chat-operators/resolve-chat-scope";
import { draftTemplateDataWithClients } from "@/application/use-cases/fiche/draft-fiche";
import type { Conversation } from "@/domain/entities/chat";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import type { ChatbotConfig, FicheDefinition } from "@/domain/entities/chatbot-config";
import type { ConversationFicheInstance } from "@/domain/entities/conversation-fiche-instance";
import {
  type ConversationFicheView,
  type ConversationFieldsView,
  type ConversationFieldView,
  isFieldEmpty,
  isFieldRequired,
} from "@/domain/entities/conversation-field";
import { validatePartialTemplateData } from "@/domain/validate-template-data";

export type ConversationFieldsDependencies = {
  conversations: ConversationRepository;
  operatorScopes: ChatOperatorScopeRepository;
  links: ChatLinkRepository;
  templates: ChatTemplateRepository;
  configs: ChatbotConfigRepository;
  ficheInstances: ConversationFicheInstanceRepository;
  attachments: AttachmentRepository;
  fields: ConversationFieldRepository;
  ai: AiClientFactory;
};

type Context = {
  conversation: Conversation;
  /** Configuration chatbot courante (ADR-0049) ; null = mode legacy. */
  config: ChatbotConfig | null;
  definition: TemplateDefinition | null;
  templateKey: string;
  templateVersion: number;
  templateLabel: string;
  instances: ConversationFicheInstance[];
};

function requiredFieldNames(fiche: FicheDefinition): string[] {
  return fiche.fields.filter((field) => field.required).map((field) => field.name);
}

/**
 * Garantit une instance par fiche pour une conversation config-only : la
 * première fiche sans instance active devient active, les autres sont
 * « detected ». Idempotent (unicité conversation/fiche/instance).
 */
async function ensureConfigInstances(
  deps: ConversationFieldsDependencies,
  organizationId: string,
  conversationId: string,
  config: ChatbotConfig,
): Promise<ConversationFicheInstance[]> {
  let instances = await deps.ficheInstances.listByConversation(organizationId, conversationId);
  const known = new Set(instances.map((instance) => instance.ficheKey));
  let hasActive = instances.some((instance) => instance.status === "active");
  for (const fiche of config.fiches) {
    if (known.has(fiche.key)) continue;
    const status = hasActive ? "detected" : "active";
    if (status === "active") hasActive = true;
    await deps.ficheInstances.upsert({
      organizationId,
      conversationId,
      configId: config.id,
      ficheKey: fiche.key,
      status,
      data: {},
      missingFields: requiredFieldNames(fiche),
    });
  }
  instances = await deps.ficheInstances.listByConversation(organizationId, conversationId);
  return instances;
}

async function loadContext(
  deps: ConversationFieldsDependencies,
  actor: Actor,
  conversationId: string,
): Promise<Context> {
  const organizationId = organizationOf(actor);
  const allowedLinkIds = await resolveConversationLinkScope(deps.operatorScopes, actor);

  const conversation = await deps.conversations.findById(
    organizationId,
    conversationId,
    allowedLinkIds,
  );
  if (conversation === null) throw new NotFoundError("Conversation introuvable");

  const link = await deps.links.findById(organizationId, conversation.linkId);
  if (link === null) throw new NotFoundError("Lien introuvable");

  const configId = link.currentConfigId ?? null;
  if (configId !== null && configId !== "") {
    const config = await deps.configs.findById(organizationId, configId);
    if (config !== null) {
      const instances = await ensureConfigInstances(deps, organizationId, conversation.id, config);
      const primary = config.fiches[0];
      return {
        conversation,
        config,
        definition: null,
        templateKey: primary?.key ?? "",
        templateVersion: config.version,
        templateLabel: primary?.label ?? "",
        instances,
      };
    }
  }

  const template = await deps.templates.findVersion(
    organizationId,
    link.templateKey,
    link.templateVersion,
  );
  if (template === null) throw new NotFoundError("Modèle de raisonnement introuvable");

  return {
    conversation,
    config: null,
    definition: template.definition,
    templateKey: link.templateKey,
    templateVersion: link.templateVersion,
    templateLabel: template.definition.label,
    instances: [],
  };
}

function buildFieldViews(
  fields: readonly FicheDefinition["fields"][number][],
  values: Readonly<Record<string, unknown>>,
  attachmentCounts: Readonly<Record<string, number>>,
): ConversationFieldView[] {
  return fields.map((field) => {
    const value = values[field.name] ?? null;
    const attachmentCount = attachmentCounts[field.name] ?? 0;
    const requiredNow = isFieldRequired(field, values);
    const missing = field.type === "file" ? attachmentCount === 0 : isFieldEmpty(field, value);
    return {
      ...field,
      value,
      source: null,
      updatedAt: null,
      attachmentCount,
      requiredNow,
      missing,
    };
  });
}

function counters(fields: readonly ConversationFieldView[]): {
  requiredTotal: number;
  requiredCollected: number;
  requiredMissing: number;
  collectedTotal: number;
  total: number;
} {
  const required = fields.filter((field) => field.requiredNow);
  const requiredCollected = required.filter((field) => !field.missing).length;
  return {
    requiredTotal: required.length,
    requiredCollected,
    requiredMissing: required.length - requiredCollected,
    collectedTotal: fields.filter((field) => !field.missing).length,
    total: fields.length,
  };
}

function buildFicheViews(
  config: ChatbotConfig,
  instances: readonly ConversationFicheInstance[],
  attachmentCounts: Readonly<Record<string, number>>,
): ConversationFicheView[] {
  const views: ConversationFicheView[] = [];
  for (const fiche of config.fiches) {
    const matching = instances.filter((entry) => entry.ficheKey === fiche.key);
    if (matching.length === 0) {
      const fields = buildFieldViews(fiche.fields, {}, attachmentCounts);
      views.push({
        instanceId: null,
        ficheKey: fiche.key,
        label: fiche.label,
        status: "detected",
        fields,
        ...counters(fields),
      });
      continue;
    }
    for (const instance of matching) {
      const fields = buildFieldViews(fiche.fields, instance.data, attachmentCounts);
      views.push({
        instanceId: instance.id,
        ficheKey: fiche.key,
        label:
          instance.instanceKey === "default"
            ? fiche.label
            : `${fiche.label} (${instance.instanceKey})`,
        status: instance.status,
        fields,
        ...counters(fields),
      });
    }
  }
  return views;
}

async function buildSnapshot(
  deps: ConversationFieldsDependencies,
  actor: Actor,
  context: Context,
  canEdit: boolean,
): Promise<ConversationFieldsView> {
  const organizationId = organizationOf(actor);
  const [stored, analysis, attachments] = await Promise.all([
    deps.fields.list(organizationId, context.conversation.id),
    deps.fields.getAnalysis(organizationId, context.conversation.id),
    deps.attachments.listByConversation(organizationId, context.conversation.id),
  ]);

  const attachmentCounts: Record<string, number> = {};
  for (const attachment of attachments) {
    attachmentCounts[attachment.fieldName] = (attachmentCounts[attachment.fieldName] ?? 0) + 1;
  }

  const currentAnalysis = analysis ?? {
    lastAnalyzedMessageAt: null,
    lastAnalyzedAt: null,
    status: "idle" as const,
    error: null,
  };
  const stale =
    context.conversation.lastMessageAt !== null &&
    (currentAnalysis.lastAnalyzedMessageAt === null ||
      context.conversation.lastMessageAt > currentAnalysis.lastAnalyzedMessageAt);

  if (context.config !== null) {
    const fiches = buildFicheViews(context.config, context.instances, attachmentCounts);
    const active =
      fiches.find((fiche) =>
        context.instances.some(
          (instance) => instance.id === fiche.instanceId && instance.status === "active",
        ),
      ) ??
      fiches[0] ??
      null;
    const top = counters(active?.fields ?? []);
    return {
      conversationId: context.conversation.id,
      configId: context.config.id,
      templateKey: active?.ficheKey ?? context.templateKey,
      templateVersion: context.config.version,
      templateLabel: active?.label ?? context.templateLabel,
      fields: active?.fields ?? [],
      ...top,
      fiches,
      analysis: currentAnalysis,
      stale,
      canEdit,
    };
  }

  const definition = context.definition;
  if (definition === null) throw new NotFoundError("Modèle de raisonnement introuvable");

  const byName = new Map(stored.map((entry) => [entry.fieldName, entry]));
  const values: Record<string, unknown> = {};
  for (const entry of stored) values[entry.fieldName] = entry.value;

  const fields: ConversationFieldView[] = definition.fields.map((field) => {
    const entry = byName.get(field.name);
    const attachmentCount = attachmentCounts[field.name] ?? 0;
    const requiredNow = isFieldRequired(field, values);
    const missing =
      field.type === "file" ? attachmentCount === 0 : isFieldEmpty(field, entry?.value ?? null);
    return {
      ...field,
      value: entry?.value ?? null,
      source: entry?.source ?? null,
      updatedAt: entry?.updatedAt ?? null,
      attachmentCount,
      requiredNow,
      missing,
    };
  });

  return {
    conversationId: context.conversation.id,
    configId: null,
    templateKey: context.templateKey,
    templateVersion: context.templateVersion,
    templateLabel: context.templateLabel,
    fields,
    ...counters(fields),
    analysis: currentAnalysis,
    stale,
    canEdit,
  };
}

type ConfigTarget = {
  fiche: FicheDefinition;
  instance: ConversationFicheInstance | null;
};

function resolveConfigTarget(
  context: Context,
  ficheInstanceId: string | null,
): ConfigTarget | null {
  if (context.config === null) return null;
  const instances = context.instances;
  if (ficheInstanceId !== null) {
    const exact = instances.find((instance) => instance.id === ficheInstanceId) ?? null;
    if (exact === null) return null;
    const exactFiche =
      context.config.fiches.find((entry) => entry.key === exact.ficheKey) ??
      context.config.fiches[0] ??
      null;
    return exactFiche === null ? null : { fiche: exactFiche, instance: exact };
  }
  const target = instances.find((instance) => instance.status === "active") ?? instances[0] ?? null;
  const fiche =
    target === null
      ? (context.config.fiches[0] ?? null)
      : (context.config.fiches.find((entry) => entry.key === target.ficheKey) ??
        context.config.fiches[0] ??
        null);
  if (fiche === null) return null;
  return { fiche, instance: target };
}

function parseUpdateInput(input: unknown): {
  values: Record<string, unknown>;
  ficheInstanceId: string | null;
} {
  if (input !== null && typeof input === "object" && !Array.isArray(input)) {
    const raw = input as Record<string, unknown>;
    if (raw.values !== null && typeof raw.values === "object" && !Array.isArray(raw.values)) {
      return {
        values: raw.values as Record<string, unknown>,
        ficheInstanceId:
          typeof raw.ficheInstanceId === "string" && raw.ficheInstanceId !== ""
            ? raw.ficheInstanceId
            : null,
      };
    }
    return { values: raw, ficheInstanceId: null };
  }
  return { values: {}, ficheInstanceId: null };
}

async function persistFicheData(
  deps: ConversationFieldsDependencies,
  context: Context,
  target: ConfigTarget,
  organizationId: string,
  values: Record<string, unknown>,
): Promise<void> {
  if (context.config === null) return;
  const merged = { ...(target.instance?.data ?? {}), ...values };
  const fields = buildFieldViews(target.fiche.fields, merged, {});
  const missingFields = fields.filter((field) => field.missing).map((field) => field.name);
  if (target.instance === null) {
    const hasActive = context.instances.some((instance) => instance.status === "active");
    await deps.ficheInstances.upsert({
      organizationId,
      conversationId: context.conversation.id,
      configId: context.config.id,
      ficheKey: target.fiche.key,
      status: hasActive ? "detected" : "active",
      data: values,
      missingFields,
    });
    return;
  }
  await deps.ficheInstances.update(organizationId, target.instance.id, {
    data: values,
    missingFields,
  });
}

export async function getConversationFields(
  deps: ConversationFieldsDependencies,
  actor: Actor,
  conversationId: string,
): Promise<ConversationFieldsView> {
  assertCan(actor, "conversations:read");
  const context = await loadContext(deps, actor, conversationId);
  return buildSnapshot(deps, actor, context, actorCan(actor, "conversations:update_fields"));
}

export async function updateConversationFields(
  deps: ConversationFieldsDependencies,
  actor: Actor,
  conversationId: string,
  input: unknown,
): Promise<ConversationFieldsView> {
  assertCan(actor, "conversations:update_fields");
  const context = await loadContext(deps, actor, conversationId);
  const { values: source, ficheInstanceId } = parseUpdateInput(input);
  const organizationId = organizationOf(actor);

  if (context.config !== null) {
    const target = resolveConfigTarget(context, ficheInstanceId);
    if (target === null) throw new NotFoundError("Fiche de collecte introuvable");
    const definition = ficheToDefinition(context.config, target.fiche);
    const allowed = new Set(
      target.fiche.fields.filter((field) => field.type !== "file").map((field) => field.name),
    );
    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(source)) {
      if (allowed.has(key)) filtered[key] = value;
    }
    const validated = validatePartialTemplateData(definition, filtered);
    if (!validated.ok) throw new UnprocessableError(validated.errors.join(" ; "));
    await persistFicheData(deps, context, target, organizationId, validated.value);
    return buildSnapshot(deps, actor, context, true);
  }

  const definition = context.definition;
  if (definition === null) throw new NotFoundError("Modèle de raisonnement introuvable");
  const allowed = new Set(
    definition.fields.filter((field) => field.type !== "file").map((field) => field.name),
  );
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (allowed.has(key)) filtered[key] = value;
  }
  const validated = validatePartialTemplateData(definition, filtered);
  if (!validated.ok) throw new UnprocessableError(validated.errors.join(" ; "));

  await deps.fields.upsertManual(
    organizationId,
    conversationId,
    Object.entries(validated.value).map(([fieldName, value]) => ({
      fieldName,
      value,
      source: "manual" as const,
      updatedBy: actor.id,
    })),
  );
  return buildSnapshot(deps, actor, context, true);
}

function hasAiValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim() !== "";
  if (Array.isArray(value))
    return value.some((entry) => typeof entry === "string" && entry.trim() !== "");
  return value !== null && value !== undefined;
}

async function runExtraction(
  deps: ConversationFieldsDependencies,
  organizationId: string,
  conversationId: string,
  link: NonNullable<Awaited<ReturnType<ChatLinkRepository["findById"]>>>,
  definition: TemplateDefinition,
): Promise<Record<string, unknown>> {
  assertTokenBudgetAvailable(link);
  const target = {
    organizationId,
    aiProviderId: link.aiProviderId,
    aiModel: link.aiModel,
  };
  const clients = deps.ai.forExtraction
    ? await deps.ai.forExtraction(target)
    : [{ label: "lien", client: await deps.ai.forTarget(target) }];
  const recordUsage = async (operation: string, usage: AiTokenUsage): Promise<void> => {
    await deps.links.recordAiUsage?.(organizationId, link.id, {
      conversationId,
      operation,
      ...usage,
    });
  };
  const trackedClients = clients.map((entry) => ({
    ...entry,
    client: withAiUsage(entry.client, recordUsage, "field_extraction"),
  }));
  return draftTemplateDataWithClients(
    { conversations: deps.conversations },
    trackedClients,
    organizationId,
    conversationId,
    definition,
  );
}

export async function refreshConversationFields(
  deps: ConversationFieldsDependencies,
  actor: Actor,
  conversationId: string,
  ficheInstanceId?: string | null,
): Promise<ConversationFieldsView> {
  assertCan(actor, "conversations:update_fields");
  const context = await loadContext(deps, actor, conversationId);
  const organizationId = organizationOf(actor);
  const lastMessageAt = context.conversation.lastMessageAt;

  if (lastMessageAt === null) {
    return buildSnapshot(deps, actor, context, true);
  }

  try {
    const link = await deps.links.findById(organizationId, context.conversation.linkId);
    if (link === null) throw new NotFoundError("Lien introuvable");

    if (context.config !== null) {
      const target = resolveConfigTarget(context, ficheInstanceId ?? null);
      if (target === null) throw new NotFoundError("Fiche de collecte introuvable");
      const definition = ficheToDefinition(context.config, target.fiche);
      const draft = await runExtraction(deps, organizationId, conversationId, link, definition);
      const validated = validatePartialTemplateData(definition, draft);
      if (!validated.ok) throw new UnprocessableError(validated.errors.join(" ; "));
      const entries = Object.fromEntries(
        Object.entries(validated.value).filter(([, value]) => hasAiValue(value)),
      );
      await persistFicheData(deps, context, target, organizationId, entries);
      await deps.fields.saveAnalysis(organizationId, conversationId, {
        lastAnalyzedMessageAt: lastMessageAt,
        lastAnalyzedAt: new Date().toISOString(),
        status: "ok",
        error: null,
      });
      return buildSnapshot(deps, actor, context, true);
    }

    const definition = context.definition;
    if (definition === null) throw new NotFoundError("Modèle de raisonnement introuvable");
    const draft = await runExtraction(deps, organizationId, conversationId, link, definition);
    const validated = validatePartialTemplateData(definition, draft);
    if (!validated.ok) throw new UnprocessableError(validated.errors.join(" ; "));

    const entries = Object.entries(validated.value)
      .filter(([, value]) => hasAiValue(value))
      .map(([fieldName, value]) => ({
        fieldName,
        value,
        source: "ai" as const,
        updatedBy: null,
      }));
    await deps.fields.upsertAi(organizationId, conversationId, entries);
    await deps.fields.saveAnalysis(organizationId, conversationId, {
      lastAnalyzedMessageAt: lastMessageAt,
      lastAnalyzedAt: new Date().toISOString(),
      status: "ok",
      error: null,
    });
    return buildSnapshot(deps, actor, context, true);
  } catch (error) {
    const message =
      error instanceof AppError ? error.message : "Analyse IA momentanément indisponible";
    await deps.fields
      .saveAnalysis(organizationId, conversationId, {
        lastAnalyzedMessageAt: null,
        lastAnalyzedAt: new Date().toISOString(),
        status: "error",
        error: message,
      })
      .catch(() => undefined);
    if (error instanceof AppError) throw error;
    throw new BadGatewayError(message);
  }
}
