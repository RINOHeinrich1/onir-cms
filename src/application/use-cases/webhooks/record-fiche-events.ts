import type { AttachmentRepository } from "@/application/ports/attachment-repository";
import type { FicheEventRepository } from "@/application/ports/fiche-event-repository";
import type { WebhookEndpointRepository } from "@/application/ports/webhook-endpoint-repository";
import type { TemplateDefinition } from "@/domain/entities/chat-template";
import type { ChatbotConfig } from "@/domain/entities/chatbot-config";
import type {
  ConversationFicheInstance,
  FicheInstanceStatus,
} from "@/domain/entities/conversation-fiche-instance";
import type { Fiche } from "@/domain/entities/fiche";
import type { FicheEventPayload } from "@/domain/entities/webhook-event";
import { evaluateFicheTransitions, type FicheTransitionState } from "@/domain/fiche-transition";

export type FicheEventRecorderDependencies = {
  endpoints: WebhookEndpointRepository;
  events: FicheEventRepository;
  attachments?: AttachmentRepository;
};

function definitionFor(config: ChatbotConfig, ficheKey: string): TemplateDefinition | null {
  const fiche = config.fiches.find((entry) => entry.key === ficheKey);
  if (fiche === undefined) return null;
  return {
    key: fiche.key,
    label: fiche.label,
    description: fiche.description,
    systemPrompt: "",
    fields: fiche.fields,
    renderTemplate: fiche.renderTemplate,
  };
}

function payloadFor(input: {
  config: ChatbotConfig;
  conversationId: string;
  prospectId: string | null;
  instance: ConversationFicheInstance;
  definition: TemplateDefinition;
  attachmentCounts: Readonly<Record<string, number>>;
}): FicheEventPayload {
  return {
    ficheKey: input.instance.ficheKey,
    ficheLabel: input.definition.label,
    definition: input.definition,
    data: input.instance.data,
    missingFields: input.instance.missingFields,
    attachmentCounts: input.attachmentCounts,
    status: input.instance.status,
    conversationId: input.conversationId,
    prospectId: input.prospectId,
    chatLinkId: input.config.chatLinkId,
    configId: input.config.id,
    occurredAt: new Date().toISOString(),
  };
}

export async function recordFicheTransition(
  deps: FicheEventRecorderDependencies,
  input: {
    organizationId: string;
    config: ChatbotConfig;
    conversationId: string;
    prospectId: string | null;
    instance: ConversationFicheInstance;
    before: {
      data: Record<string, unknown>;
      status: FicheInstanceStatus;
      attachmentCounts: Readonly<Record<string, number>>;
    };
    afterAttachmentCounts?: Readonly<Record<string, number>>;
  },
): Promise<void> {
  try {
    const definition = definitionFor(input.config, input.instance.ficheKey);
    if (definition === null) return;
    const triggers = await deps.endpoints.listAutomaticTriggers(
      input.organizationId,
      input.config.chatLinkId,
      input.instance.ficheKey,
    );
    if (triggers.length === 0) return;
    const fields = [
      ...new Set(
        triggers
          .filter((trigger) => trigger.eventType === "fiche.draft.field_filled")
          .flatMap((trigger) => (trigger.fieldKey === null ? [] : [trigger.fieldKey])),
      ),
    ];
    const seenGroups = new Set<string>();
    const fieldGroups = triggers
      .filter((trigger) => trigger.eventType === "fiche.draft.fields_filled")
      .flatMap((trigger) => {
        const keys = trigger.fieldKeys ?? [];
        if (keys.length === 0) return [];
        const key = [...keys].sort().join(",");
        if (seenGroups.has(key)) return [];
        seenGroups.add(key);
        return [keys];
      });
    const after: FicheTransitionState = {
      data: input.instance.data,
      status: input.instance.status,
      attachmentCounts: input.afterAttachmentCounts ?? input.before.attachmentCounts,
    };
    const events = evaluateFicheTransitions(
      definition,
      {
        data: input.before.data,
        status: input.before.status,
        attachmentCounts: input.before.attachmentCounts,
      },
      after,
      {
        allFields: triggers.some(
          (trigger) => trigger.eventType === "fiche.draft.all_fields_filled",
        ),
        requiredFields: triggers.some(
          (trigger) => trigger.eventType === "fiche.draft.required_fields_filled",
        ),
        fields,
        fieldGroups,
      },
    );
    for (const event of events) {
      await deps.events.create({
        organizationId: input.organizationId,
        eventType: event.eventType,
        source: "draft",
        chatLinkId: input.config.chatLinkId,
        configId: input.config.id,
        ficheKey: input.instance.ficheKey,
        conversationId: input.conversationId,
        ficheInstanceId: input.instance.id,
        ficheId: null,
        fieldKey: event.fieldKey,
        fieldKeys: event.fieldKeys ?? null,
        payload: payloadFor({
          config: input.config,
          conversationId: input.conversationId,
          prospectId: input.prospectId,
          instance: input.instance,
          definition,
          attachmentCounts: input.afterAttachmentCounts ?? input.before.attachmentCounts,
        }),
      });
    }
  } catch {
    // Une erreur de webhook ne doit jamais bloquer le chat.
  }
}

export async function recordValidatedFiche(
  deps: FicheEventRecorderDependencies,
  input: {
    organizationId: string;
    config: ChatbotConfig;
    conversationId: string;
    prospectId: string | null;
    fiche: Fiche;
  },
): Promise<void> {
  try {
    const definition =
      input.fiche.definition ?? definitionFor(input.config, input.fiche.ficheKey ?? "");
    if (definition === null) return;
    const ficheKey = input.fiche.ficheKey ?? definition.key;
    const attachmentCounts = await attachmentCountsForConversation(
      deps.attachments,
      input.organizationId,
      input.conversationId,
    );
    if (
      !(await deps.endpoints.hasAutomaticTriggers(
        input.organizationId,
        input.config.chatLinkId,
        ficheKey,
      ))
    ) {
      return;
    }
    await deps.events.create({
      organizationId: input.organizationId,
      eventType: "fiche.validated",
      source: "fiche",
      chatLinkId: input.config.chatLinkId,
      configId: input.config.id,
      ficheKey,
      conversationId: input.conversationId,
      ficheInstanceId: input.fiche.conversationFicheInstanceId ?? null,
      ficheId: input.fiche.id,
      fieldKey: null,
      payload: {
        ficheKey,
        ficheLabel: definition.label,
        definition,
        data: input.fiche.data,
        missingFields: [],
        attachmentCounts,
        status: "complete",
        conversationId: input.conversationId,
        prospectId: input.prospectId,
        chatLinkId: input.config.chatLinkId,
        configId: input.config.id,
        occurredAt: new Date().toISOString(),
      },
    });
  } catch {
    // Une erreur de webhook ne doit jamais bloquer la validation.
  }
}

export async function attachmentCountsForConversation(
  attachments: AttachmentRepository | undefined,
  organizationId: string,
  conversationId: string,
): Promise<Record<string, number>> {
  if (attachments === undefined) return {};
  const rows = await attachments.listByConversation(organizationId, conversationId);
  const counts: Record<string, number> = {};
  for (const row of rows) counts[row.fieldName] = (counts[row.fieldName] ?? 0) + 1;
  return counts;
}
