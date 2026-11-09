import { AppError, NotFoundError, UnprocessableError, ValidationError } from "@/application/errors";
import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { ChatLinkRepository } from "@/application/ports/chat-link-repository";
import type { ChatbotConfigRepository } from "@/application/ports/chatbot-config-repository";
import type { ConversationFicheInstanceRepository } from "@/application/ports/conversation-fiche-instance-repository";
import type { ConversationRepository } from "@/application/ports/conversation-repository";
import { ficheToDefinition } from "@/application/use-cases/chat/chatbot-config-runtime";
import type { FicheDefinition } from "@/domain/entities/chatbot-config";
import { isFieldEmpty, isFieldRequired } from "@/domain/entities/conversation-field";
import { validatePartialTemplateData } from "@/domain/validate-template-data";

export type SubmitChatCollectionDependencies = {
  conversations: ConversationRepository;
  links: ChatLinkRepository;
  configs: ChatbotConfigRepository;
  ficheInstances: ConversationFicheInstanceRepository;
  attachments: AttachmentRepository;
};

export type SubmitChatCollectionInput = {
  organizationId: string;
  conversationId: string;
  ficheInstanceId?: string;
  ficheKey?: string;
  values: Record<string, unknown>;
};

export type SubmitChatCollectionResult = {
  ficheInstanceId: string;
  ficheKey: string;
  status: string;
  missingFields: string[];
};

function missingFields(
  fiche: FicheDefinition,
  data: Readonly<Record<string, unknown>>,
  attachmentCounts: Readonly<Record<string, number>>,
): string[] {
  return fiche.fields
    .filter((field) => {
      if (!isFieldRequired(field, data)) return false;
      if (field.type === "file") return (attachmentCounts[field.name] ?? 0) === 0;
      return isFieldEmpty(field, data[field.name]);
    })
    .map((field) => field.name);
}

/**
 * Soumission du formulaire de collecte : la source de vérité est l'instance
 * de fiche, pas la table legacy des champs de conversation (ADR-0082).
 */
export async function submitChatCollection(
  deps: SubmitChatCollectionDependencies,
  input: SubmitChatCollectionInput,
): Promise<SubmitChatCollectionResult> {
  const conversation = await deps.conversations.findByIdPublic(input.conversationId);
  if (conversation === null) throw new NotFoundError("Conversation introuvable");
  if (conversation.organizationId !== input.organizationId) {
    throw new NotFoundError("Conversation introuvable");
  }
  if (conversation.statut === "finalisee") {
    throw new ValidationError("Conversation déjà terminée");
  }

  const link = await deps.links.findById(conversation.organizationId, conversation.linkId);
  if (link === null || !link.actif) throw new NotFoundError("Chatbot introuvable");
  const configId = link.currentConfigId ?? null;
  if (configId === null || configId === "") {
    throw new UnprocessableError("Ce chatbot doit être configuré avec une fiche de collecte");
  }
  const config = await deps.configs.findById(conversation.organizationId, configId);
  if (config === null) throw new NotFoundError("Configuration du chatbot introuvable");

  const instances = await deps.ficheInstances.listByConversation(
    conversation.organizationId,
    conversation.id,
  );
  const requestedFiche =
    input.ficheKey === undefined
      ? undefined
      : config.fiches.find((entry) => entry.key === input.ficheKey);
  if (input.ficheKey !== undefined && requestedFiche === undefined) {
    throw new UnprocessableError("Fiche de collecte introuvable");
  }
  const requestedInstance =
    input.ficheInstanceId === undefined
      ? input.ficheKey === undefined
        ? undefined
        : instances.find((instance) => instance.ficheKey === input.ficheKey)
      : instances.find((instance) => instance.id === input.ficheInstanceId);
  if (input.ficheInstanceId !== undefined && requestedInstance === undefined) {
    throw new UnprocessableError("Instance de fiche introuvable");
  }
  let target =
    requestedInstance ??
    (input.ficheKey === undefined
      ? instances.find((instance) => instance.status === "active")
      : undefined);

  const fiche =
    requestedFiche ??
    (target
      ? config.fiches.find((entry) => entry.key === target?.ficheKey)
      : config.fiches.length === 1
        ? config.fiches[0]
        : null);
  if (fiche === undefined || fiche === null) {
    throw new UnprocessableError("Sélectionnez une fiche de collecte");
  }

  let targetWasActive = target?.status === "active";
  if (target === undefined) {
    target = await deps.ficheInstances.upsert({
      organizationId: conversation.organizationId,
      conversationId: conversation.id,
      configId: config.id,
      ficheKey: fiche.key,
      status: "detected",
      data: {},
      missingFields: fiche.fields.filter((field) => field.required).map((field) => field.name),
    });
    targetWasActive = false;
  }

  const definition = ficheToDefinition(config, fiche);
  const directValues: Record<string, unknown> = {};
  for (const field of fiche.fields) {
    if (field.type === "file") continue;
    if (!Object.hasOwn(input.values, field.name)) continue;
    directValues[field.name] = input.values[field.name];
  }
  const validated = validatePartialTemplateData(definition, {
    ...target.data,
    ...directValues,
  });
  if (!validated.ok) throw new UnprocessableError(validated.errors.join(" ; "));

  const attachments = await deps.attachments.listByConversation(
    conversation.organizationId,
    conversation.id,
  );
  const attachmentCounts: Record<string, number> = {};
  for (const attachment of attachments) {
    attachmentCounts[attachment.fieldName] = (attachmentCounts[attachment.fieldName] ?? 0) + 1;
  }
  const missing = missingFields(fiche, validated.value, attachmentCounts);
  const status = target.status === "complete" ? "complete" : "active";
  const updated = await deps.ficheInstances.update(conversation.organizationId, target.id, {
    status,
    data: validated.value,
    missingFields: missing,
  });
  if (updated === null) throw new AppError("Impossible de mettre à jour la fiche", 500);
  if (status === "active" && !targetWasActive) {
    await deps.ficheInstances.activate(conversation.organizationId, conversation.id, target.id);
  }
  return {
    ficheInstanceId: updated.id,
    ficheKey: updated.ficheKey,
    status: updated.status,
    missingFields: updated.missingFields,
  };
}
