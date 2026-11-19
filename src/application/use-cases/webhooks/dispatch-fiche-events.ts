import type { FicheEventRepository } from "@/application/ports/fiche-event-repository";
import type { WebhookDeliveryRepository } from "@/application/ports/webhook-delivery-repository";
import type { WebhookEndpointRepository } from "@/application/ports/webhook-endpoint-repository";
import type { FicheLifecycleEvent } from "@/domain/entities/webhook-event";
import { missingRequiredPayloadMappings } from "@/domain/webhook-trigger-contract";

export type DispatchFicheEventsDependencies = {
  endpoints: WebhookEndpointRepository;
  deliveries: WebhookDeliveryRepository;
  events: FicheEventRepository;
};

function triggerMatches(
  event: FicheLifecycleEvent,
  endpoint: {
    triggers: Array<{ eventType: string; fieldKey: string | null }>;
  },
): boolean {
  return endpoint.triggers.some(
    (trigger) =>
      trigger.eventType === event.eventType &&
      (trigger.fieldKey === null || trigger.fieldKey === event.fieldKey),
  );
}

/** Crée les livraisons correspondant aux événements en attente. */
export async function dispatchFicheEvents(
  deps: DispatchFicheEventsDependencies,
  limit = 50,
): Promise<number> {
  const events = await deps.events.listPending(limit);
  let dispatched = 0;
  for (const event of events) {
    if (event.chatLinkId === null) {
      await deps.events.markFailed(event.organizationId, event.id, "Périmètre chatbot absent");
      continue;
    }
    const endpoints = await deps.endpoints.list(event.organizationId, {
      chatLinkId: event.chatLinkId,
    });
    const matching = endpoints.filter(
      (endpoint) =>
        endpoint.enabled &&
        endpoint.deletedAt === null &&
        (endpoint.ficheKey === null || endpoint.ficheKey === event.ficheKey) &&
        triggerMatches(event, endpoint),
    );
    try {
      let created = 0;
      let incomplete = 0;
      for (const endpoint of matching) {
        const missing = missingRequiredPayloadMappings(
          endpoint.fieldMappings,
          event.payload.definition,
          {
            data: event.payload.data,
            attachmentCounts: event.payload.attachmentCounts ?? {},
            conversationId: event.conversationId,
            prospectId: event.payload.prospectId,
          },
        );
        if (missing.length > 0) {
          incomplete += 1;
          continue;
        }
        await deps.deliveries.create(event.organizationId, {
          endpointId: endpoint.id,
          ficheId: event.ficheId,
          chatLinkId: event.chatLinkId,
          ficheKey: event.ficheKey,
          ficheEventId: event.id,
          eventType: event.eventType,
          source: event.source,
          isTest: false,
          replayOfId: null,
          idempotencyKey: `${event.id}:${endpoint.id}`,
          requestSnapshot: null,
          triggeredBy: null,
        });
        created += 1;
      }
      if (created === 0 && incomplete > 0) {
        await deps.events.markPayloadIncomplete(
          event.organizationId,
          event.id,
          "Mappings requis absents du snapshot",
        );
        continue;
      }
      await deps.events.markDispatched(event.organizationId, event.id);
      dispatched += 1;
    } catch (error) {
      await deps.events.markFailed(
        event.organizationId,
        event.id,
        error instanceof Error ? error.message : "Échec de dispatch",
      );
    }
  }
  return dispatched;
}
