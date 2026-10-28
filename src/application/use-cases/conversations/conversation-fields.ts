import { type Actor, actorCan, assertCan, organizationOf } from "@/application/actor";
import { AppError, BadGatewayError, NotFoundError, UnprocessableError } from "@/application/errors";
import type { AiClientFactory } from "@/application/ports/ai-client-factory";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatOperatorScopeRepository } from "@/application/ports/chat-operator-scope-repository";
import type { ChatTemplateRepository } from "@/application/ports/chat-template-repository";
import type { ConversationFieldRepository } from "@/application/ports/conversation-field-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import { resolveConversationLinkScope } from "@/application/use-cases/chat-operators/resolve-chat-scope";
import { draftTemplateDataFromConversation } from "@/application/use-cases/fiche/draft-fiche";
import type { Conversation } from "@/domain/entities/chat";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import {
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
  attachments: AttachmentRepository;
  fields: ConversationFieldRepository;
  ai: AiClientFactory;
};

type Context = {
  conversation: Conversation;
  definition: TemplateDefinition;
  templateKey: string;
  templateVersion: number;
  templateLabel: string;
};

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

  const template = await deps.templates.findVersion(
    organizationId,
    link.templateKey,
    link.templateVersion,
  );
  if (template === null) throw new NotFoundError("Modèle de raisonnement introuvable");

  return {
    conversation,
    definition: template.definition,
    templateKey: link.templateKey,
    templateVersion: link.templateVersion,
    templateLabel: template.definition.label,
  };
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

  const byName = new Map(stored.map((entry) => [entry.fieldName, entry]));
  const attachmentCounts: Record<string, number> = {};
  for (const attachment of attachments) {
    attachmentCounts[attachment.fieldName] = (attachmentCounts[attachment.fieldName] ?? 0) + 1;
  }
  const values: Record<string, unknown> = {};
  for (const entry of stored) values[entry.fieldName] = entry.value;

  const fields: ConversationFieldView[] = context.definition.fields.map((field) => {
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

  const required = fields.filter((field) => field.requiredNow);
  const requiredCollected = required.filter((field) => !field.missing).length;
  const requiredMissing = required.length - requiredCollected;
  const collectedTotal = fields.filter((field) => !field.missing).length;
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

  return {
    conversationId: context.conversation.id,
    templateKey: context.templateKey,
    templateVersion: context.templateVersion,
    templateLabel: context.templateLabel,
    fields,
    requiredTotal: required.length,
    requiredCollected,
    requiredMissing,
    collectedTotal,
    total: fields.length,
    analysis: currentAnalysis,
    stale,
    canEdit,
  };
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
  const source =
    input !== null && typeof input === "object" && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  const allowed = new Set(
    context.definition.fields.filter((field) => field.type !== "file").map((field) => field.name),
  );
  const filtered: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(source)) {
    if (allowed.has(key)) filtered[key] = value;
  }
  const validated = validatePartialTemplateData(context.definition, filtered);
  if (!validated.ok) throw new UnprocessableError(validated.errors.join(" ; "));

  const organizationId = organizationOf(actor);
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

export async function refreshConversationFields(
  deps: ConversationFieldsDependencies,
  actor: Actor,
  conversationId: string,
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
    const ai = await deps.ai.forTarget({
      organizationId,
      aiProviderId: link.aiProviderId,
      aiModel: link.aiModel,
    });
    const draft = await draftTemplateDataFromConversation(
      { conversations: deps.conversations, ai },
      organizationId,
      conversationId,
      context.definition,
    );
    const validated = validatePartialTemplateData(context.definition, draft);
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
